#!/usr/bin/env python3
"""Maintain a live scoreboard from a running paired tournament's JSONL shards."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
parser.add_argument("--interval", type=float, default=10)
args = parser.parse_args()
directory = args.directory.resolve()


def update():
    progress = json.loads((directory / "status.json").read_text())
    games = []
    for shard in sorted(directory.glob("shard-*.jsonl")):
        with shard.open() as stream:
            for line in stream:
                if line.endswith("\n"):
                    games.append(json.loads(line))
    pairs = {}
    for game in games:
        pairs.setdefault(game["seed"], []).append(game)
    finished = [pair for pair in pairs.values() if len(pair) == 2]
    result = {
        "state": progress["state"],
        "updated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "completed_games": len(games),
        "expected_games": progress["expected_games"],
        "completed_paired_openings": len(finished),
        "expected_paired_openings": progress["paired_openings"],
        "experimental_wins": sum(game["newWin"] for game in games),
        "advanced_wins": sum(1 - game["newWin"] for game in games),
        "experimental_wins_by_side": {
            str(side): sum(game["newWin"] for game in games if game["newSide"] == side)
            for side in (0, 1)
        },
        "experimental_sweeps": sum(sum(game["newWin"] for game in pair) == 2 for pair in finished),
        "advanced_sweeps": sum(sum(game["newWin"] for game in pair) == 0 for pair in finished),
        "split_openings": sum(sum(game["newWin"] for game in pair) == 1 for pair in finished),
    }
    result["experimental_win_rate"] = result["experimental_wins"] / len(games) if games else None
    temporary = directory / "live-score.tmp"
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(directory / "live-score.json")
    return result


while True:
    result = update()
    if result["state"] in ("complete", "failed"):
        break
    time.sleep(args.interval)
