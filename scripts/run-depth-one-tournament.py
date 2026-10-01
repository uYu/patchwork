#!/usr/bin/env python3
"""Run a paired first-internal-model tournament with resumable result files.

The isolated match binary must be prepared and compiled before starting this
script. A status.json and one flushed JSONL shard per worker record progress.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Lock
import time


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--pairs", type=int, required=True)
parser.add_argument("--budget-ms", type=int, required=True)
parser.add_argument("--seed", type=int, required=True)
parser.add_argument("--workers", type=int, default=2)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
if args.pairs < 1 or args.budget_ms < 1 or args.workers < 1 or args.workers > args.pairs:
    parser.error("invalid match size, budget, or worker count")

binary = root / ".build/depth-one-match/match"
if not binary.is_file():
    parser.error(f"compile {binary} first")
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
status_path = output / "status.json"
if status_path.exists() or any(output.glob("shard-*.jsonl")):
    parser.error(f"refusing to overwrite existing tournament in {output}")

lock = Lock()
started = time.monotonic()
status = {
    "state": "running", "started_utc": utc_now(), "pid": os.getpid(),
    "paired_openings": args.pairs, "expected_games": 2 * args.pairs,
    "completed_games": 0, "budget_ms_per_decision": args.budget_ms,
    "first_seed": args.seed, "workers": args.workers,
    "new": "root and first internal model", "old": "root-only model",
}


def save_status():
    with lock:
        status["updated_utc"] = utc_now()
        status["elapsed_seconds"] = round(time.monotonic() - started, 1)
        temporary = status_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(status, indent=2) + "\n")
        temporary.replace(status_path)


save_status()
sizes = [args.pairs // args.workers + (i < args.pairs % args.workers) for i in range(args.workers)]
starts = [args.seed + sum(sizes[:i]) for i in range(args.workers)]


def run_worker(index):
    count, first = sizes[index], starts[index]
    shard = output / f"shard-{index}.jsonl"
    stderr = output / f"shard-{index}.stderr.log"
    expected = [(seed, side) for seed in range(first, first + count) for side in (0, 1)]
    command = [str(binary), str(count), str(args.budget_ms), str(first)]
    with shard.open("w") as result, stderr.open("w") as errors:
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True, bufsize=1) as process:
            assert process.stdout is not None
            completed = 0
            for position, line in enumerate(process.stdout):
                row = json.loads(line)
                if position >= len(expected) or (row["seed"], row["newSide"]) != expected[position]:
                    process.kill()
                    raise RuntimeError(f"worker {index}: unexpected game at row {position}")
                result.write(line)
                result.flush()
                completed = position + 1
                with lock:
                    status["completed_games"] += 1
                    status[f"worker_{index}_games"] = completed
                save_status()
                if completed % 10 == 0:
                    print(f"worker {index}: {completed}/{len(expected)} games; total {status['completed_games']}/{2 * args.pairs}", flush=True)
            return_code = process.wait()
            if return_code != 0 or completed != len(expected):
                raise RuntimeError(f"worker {index}: exit {return_code}, completed {completed}/{len(expected)} games")


try:
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in [pool.submit(run_worker, i) for i in range(args.workers)]:
            future.result()
    combined = output / "results.jsonl"
    with combined.open("w") as destination:
        for index in range(args.workers):
            with (output / f"shard-{index}.jsonl").open() as shard:
                for line in shard:
                    destination.write(line)
    if sum(1 for _ in combined.open()) != 2 * args.pairs:
        raise RuntimeError("combined game count mismatch")
    with (output / "analysis.log").open("w") as analysis:
        subprocess.run([sys.executable, str(root / "scripts/analyze-model-match.py"), str(combined)],
                       stdout=analysis, stderr=subprocess.STDOUT, check=True)
    status["state"] = "complete"
    status["finished_utc"] = utc_now()
    status["results"] = str(combined)
    status["summary"] = str(combined.with_suffix(".summary.json"))
    save_status()
    print(f"complete: {status['summary']}", flush=True)
except Exception as error:
    status["state"] = "failed"
    status["error"] = str(error)
    save_status()
    raise
