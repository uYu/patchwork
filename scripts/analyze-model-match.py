#!/usr/bin/env python3
"""Summarize paired model matches from model-match.cpp JSON lines."""

import argparse
import json
import math
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("input", type=Path)
args = parser.parse_args()
games = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
seeds = sorted({game["seed"] for game in games})
assert len(games) == 2 * len(seeds)
for seed in seeds:
    pair = [game for game in games if game["seed"] == seed]
    assert sorted(game["newSide"] for game in pair) == [0, 1]
    assert all(game["newWin"] in (0, 1) and
               (game["newScore"] == game["oldScore"] or
                game["newWin"] == int(game["newScore"] > game["oldScore"])) for game in pair)

counts = np.array([sum(game["newWin"] for game in games if game["seed"] == seed) for seed in seeds])
margins = np.array([sum(game["newScore"] - game["oldScore"] for game in games if game["seed"] == seed) / 2
                    for seed in seeds])
sweeps, losses = int(np.sum(counts == 2)), int(np.sum(counts == 0))
decisive = sweeps + losses
p = min(1.0, 2 * sum(math.comb(decisive, k) for k in range(min(sweeps, losses) + 1)) / 2 ** decisive)
rng = np.random.default_rng(20261005)
draws = rng.integers(len(seeds), size=(20000, len(seeds)))
win_interval = np.quantile(counts[draws].mean(axis=1) / 2, [.025, .975]).tolist()
margin_interval = np.quantile(margins[draws].mean(axis=1), [.025, .975]).tolist()

def timing(side):
    turns = sum(game[f"{side}Turns"] for game in games)
    return {"turns": turns,
            "mean_decision_ms": sum(game[f"{side}ElapsedMs"] for game in games) / turns,
            "mean_simulations": sum(game[f"{side}Simulations"] for game in games) / turns,
            "mean_model_evaluations": sum(game[f"{side}ModelEvals"] for game in games) / turns}

report = {"games": len(games), "paired_openings": len(seeds), "wins": int(counts.sum()),
          "losses": len(games) - int(counts.sum()), "win_rate": float(counts.mean() / 2),
          "paired_win_bootstrap95": win_interval, "new_sweeps": sweeps,
          "old_sweeps": losses, "split_openings": int(np.sum(counts == 1)),
          "paired_exact_two_sided_p": p, "mean_score_margin": float(margins.mean()),
          "paired_margin_bootstrap95": margin_interval,
          "new_timing": timing("new"), "old_timing": timing("old")}
path = args.input.with_suffix(".summary.json")
path.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
