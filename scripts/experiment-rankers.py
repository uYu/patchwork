#!/usr/bin/env python3
"""Screen one ranker architecture on the connected-placement corpus.

Requires the sibling development workspace's learning data and architecture
module. Outputs stay in release/.build/<variant>-contact16k/.
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("variant", choices=("residual4", "pool4", "conv16"))
variant = parser.parse_args().variant
HERE = Path(__file__).resolve().parents[1]
LEARNING = HERE.parent / "learning"
OUTPUT = HERE / ".build" / f"{variant}-contact16k"
OUTPUT.mkdir(parents=True, exist_ok=True)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


arch = module("architecture", LEARNING / "architecture100k/network.py")
baseline = module("baseline", LEARNING / "network.py")
corpus = np.load(LEARNING / "contact16k/data/corpus.npz")
x, margin, game = (corpus[name] for name in ("x", "margin", "game"))
train = np.flatnonzero(game < 16000)
valid = (game >= 16000) & (game < 16500)
test = game >= 16500
assert len(train) == 48000 and valid.sum() == test.sum() == 1500

permutations = np.array([
    np.rot90(np.arange(81).reshape(9, 9)[:, ::(-1 if flip else 1)], turns).ravel()
    for flip in range(2) for turns in range(4)
])


def augment(group, rng):
    group = group.copy()
    for board in range(2):
        indices = np.repeat(permutations[rng.integers(8, size=len(group))][:, None, :], 8, axis=1)
        group[:, :, board * 81:(board + 1) * 81] = np.take_along_axis(
            group[:, :, board * 81:(board + 1) * 81], indices, axis=2
        )
    return group.reshape(-1, 247)


def sigmoid(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def predict(group, weights, forward):
    flat = group.reshape(-1, 247)
    return np.concatenate([forward(flat[i:i + 512], weights) for i in range(0, len(flat), 512)]).reshape(-1, 8)


def metrics(mask, weights, forward):
    scores = predict(x[mask], weights, forward)
    labels = margin[mask]
    target = sigmoid((labels[:, :, None] - labels[:, None, :]) / 5)
    probability = np.clip(sigmoid(scores[:, :, None] - scores[:, None, :]), 1e-7, 1 - 1e-7)
    pair_loss = -(target * np.log(probability) + (1 - target) * np.log(1 - probability))
    regret = labels.max(axis=1) - np.take_along_axis(labels, np.argsort(scores, axis=1)[:, -2:], axis=1).max(axis=1)
    return {"pair_log_loss": float(pair_loss[:, ~np.eye(8, dtype=bool)].mean()),
            "top2_regret_points": float(regret.mean()),
            "top2_contains_best": float(np.mean(regret == 0))}, regret


original = dict(np.load(LEARNING / "contact16k/models/16000/model.npz"))
weights = arch.initial_model(original, variant)
forward = lambda features, model: arch.forward(features, model, variant)
base_metrics, base_regret = metrics(test, original, baseline.forward)
assert np.max(np.abs(forward(x[:5].reshape(-1, 247), weights) - baseline.forward(x[:5].reshape(-1, 247), original))) < 2e-5

rng = np.random.default_rng(20260926)
first = {key: np.zeros_like(value) for key, value in weights.items()}
second = {key: np.zeros_like(value) for key, value in weights.items()}
best = float("inf")
stale = step = 0
history = []
for epoch in range(1, 31):
    rng.shuffle(train)
    for start in range(0, len(train), 32):
        rows = train[start:start + 32]
        logits, cache = arch.forward(augment(x[rows], rng), weights, variant, True)
        scores = logits.reshape(-1, 8)
        labels = margin[rows]
        difference = sigmoid(scores[:, :, None] - scores[:, None, :]) - sigmoid((labels[:, :, None] - labels[:, None, :]) / 5)
        dz = (2 * difference.sum(axis=2) / (len(rows) * 8 * 7)).reshape(-1, 1)
        gradients = arch.gradients(cache, dz, weights, variant)
        step += 1
        for key in weights:
            gradient = gradients[key] + (1e-4 * weights[key] if weights[key].ndim == 2 else 0)
            first[key] = .9 * first[key] + .1 * gradient
            second[key] = .999 * second[key] + .001 * gradient * gradient
            weights[key] -= .0005 * (first[key] / (1 - .9 ** step)) / (np.sqrt(second[key] / (1 - .999 ** step)) + 1e-8)
    result, _ = metrics(valid, weights, forward)
    history.append({"epoch": epoch, **result})
    print(json.dumps(history[-1]), flush=True)
    if result["pair_log_loss"] < best - 1e-4:
        best = result["pair_log_loss"]
        stale = 0
        best_epoch = epoch
        np.savez(OUTPUT / "model.npz", **weights)
    else:
        stale += 1
    if stale >= 4:
        break

selected = dict(np.load(OUTPUT / "model.npz"))
baseline_validation, _ = metrics(valid, original, baseline.forward)
validation, _ = metrics(valid, selected, forward)
trial, trial_regret = metrics(test, selected, forward)
active = np.flatnonzero(np.abs(selected["v"].ravel()) >= 1e-30)
pruned = {key: value.copy() for key, value in selected.items()}
pruned["w"] = pruned["w"][:, active]
pruned["b"] = pruned["b"][active]
pruned["v"] = pruned["v"][active]
parity = float(np.max(np.abs(predict(x[test][:50], selected, forward) -
                              predict(x[test][:50], pruned, forward))))
assert parity < 2e-5
np.savez(OUTPUT / "pruned-model.npz", **pruned)
# Resample whole source games so three groups from one game remain together.
assert np.array_equal(game[test].reshape(500, 3)[:, 0], np.arange(16500, 17000))
paired = (trial_regret - base_regret).reshape(500, 3).mean(axis=1)
bootstrap = np.random.default_rng(20261001).integers(500, size=(10000, 500))
interval = np.quantile(paired[bootstrap].mean(axis=1), [.025, .975])
report = {"model": variant, "parameters": sum(value.size for value in selected.values()),
          "pruned_parameters": sum(value.size for value in pruned.values()),
          "pruned_hidden_units": len(active), "pruning_max_error": parity,
          "train_games": 16000, "validation_games": 500, "test_games": 500,
          "best_epoch": best_epoch, "history": history,
          "validation_baseline": baseline_validation, "validation_candidate": validation,
          "test_baseline": base_metrics, "test_candidate": trial,
          "paired_top2_regret_difference": float(paired.mean()),
          "paired_difference_bootstrap95": interval.tolist()}
(OUTPUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: value for key, value in report.items() if key != "history"}, indent=2), flush=True)
