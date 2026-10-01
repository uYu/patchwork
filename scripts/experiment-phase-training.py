#!/usr/bin/env python3
"""Fine-tune the connected ranker with disjoint opening/endgame games."""

import argparse
import glob
import importlib.util
import json
import os
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
import numpy as np

HERE = Path(__file__).resolve().parents[1]
LEARNING = HERE.parent / "learning"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("corpus", type=Path, help="directory containing phase shard-*.bin files")
parser.add_argument("--revive", action="store_true", help="reinitialize dormant dense units with zero output weights")
args = parser.parse_args()
OUTPUT = HERE / ".build" / "phase-training" / (args.corpus.name + ("-revive" if args.revive else ""))
OUTPUT.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("network", LEARNING / "network.py")
network = importlib.util.module_from_spec(spec)
spec.loader.exec_module(network)

old = np.load(LEARNING / "contact16k/data/corpus.npz")
old_x, old_y, old_game = (old[name] for name in ("x", "margin", "game"))
phase = np.concatenate([
    np.fromfile(file, dtype="<f4").reshape(-1, 8, 251)
    for file in sorted(glob.glob(str(args.corpus / "shard-*.bin")))
])
assert phase.shape[0] >= 5990 and np.isfinite(phase).all()
game = phase[:, 0, 0].astype(int)
group = phase[:, 0, 1].astype(int)
assert np.all(phase[:, :, 0] == game[:, None])
assert np.all(phase[:, :, 1] == group[:, None])
assert len(np.unique(group)) == len(group)
games = int(game.max()) + 1
assert game.min() == 0 and np.array_equal(np.sort(np.unique(game)), np.arange(games))
train_end = games * 8 // 10
valid_end = games * 9 // 10
phase_x = phase[:, :, 2:249].copy()
phase_y = phase[:, :, 249].copy()

old_train = np.flatnonzero(old_game < 16000)
old_val = (old_game >= 16000) & (old_game < 16500)
old_test = old_game >= 16500
new_train = np.flatnonzero(game < train_end)
new_val = (game >= train_end) & (game < valid_end)
new_test = game >= valid_end
assert len(old_train) == 48000 and old_val.sum() == old_test.sum() == 1500
assert new_val.sum() >= (valid_end - train_end) and new_test.sum() >= (games - valid_end)

permutations = np.array([
    np.rot90(np.arange(81).reshape(9, 9)[:, ::(-1 if flip else 1)], turns).ravel()
    for flip in range(2) for turns in range(4)
])


def augment(features, rng):
    features = features.copy()
    for board in range(2):
        indices = np.repeat(permutations[rng.integers(8, size=len(features))][:, None, :], 8, axis=1)
        features[:, :, board * 81:(board + 1) * 81] = np.take_along_axis(
            features[:, :, board * 81:(board + 1) * 81], indices, axis=2
        )
    return features.reshape(-1, 247)


def sigmoid(values):
    return 1 / (1 + np.exp(-np.clip(values, -30, 30)))


def regret(features, labels, weights):
    flat = features.reshape(-1, 247)
    scores = np.concatenate([network.forward(flat[i:i + 512], weights) for i in range(0, len(flat), 512)]).reshape(-1, 8)
    best = np.take_along_axis(labels, np.argsort(scores, axis=1)[:, -2:], axis=1).max(axis=1)
    return labels.max(axis=1) - best


def validation(weights):
    mid = regret(old_x[old_val], old_y[old_val], weights)
    opening = regret(phase_x[new_val & (group % 2 == 0)], phase_y[new_val & (group % 2 == 0)], weights)
    endgame = regret(phase_x[new_val & (group % 2 == 1)], phase_y[new_val & (group % 2 == 1)], weights)
    parts = {"mid": float(mid.mean()), "opening": float(opening.mean()), "endgame": float(endgame.mean())}
    return {**parts, "equal_phase_mean": float(np.mean(list(parts.values())))}


original = dict(np.load(LEARNING / "contact16k/models/16000/model.npz"))
baseline_validation = validation(original)
weights = {key: value.copy() for key, value in original.items()}
revived = 0
if args.revive:
    dormant = np.flatnonzero(np.abs(weights["v"].ravel()) < 1e-6)
    revived = len(dormant)
    initialization = np.random.default_rng(20261004)
    weights["w"][:, dormant] = initialization.normal(0, .5 / np.sqrt(weights["w"].shape[0]),
                                                     size=(weights["w"].shape[0], revived))
    weights["b"][dormant] = .01
    weights["v"][dormant] = 0
    flat = old_x[:5].reshape(-1, 247)
    assert np.max(np.abs(network.forward(flat, weights) - network.forward(flat, original))) < 2e-5
first = {key: np.zeros_like(value) for key, value in weights.items()}
second = {key: np.zeros_like(value) for key, value in weights.items()}
rng = np.random.default_rng(20261002)
# Keep about one quarter to one third of each epoch on new phase data.
repeats = max(1, round(.4 * len(old_train) / len(new_train)))
source = np.concatenate([np.zeros(len(old_train), dtype=np.int8), np.ones(repeats * len(new_train), dtype=np.int8)])
row = np.concatenate([old_train, np.tile(new_train, repeats)])
best = baseline_validation["equal_phase_mean"]
best_epoch = 0
stale = step = 0
history = []
for epoch in range(1, 13):
    order = rng.permutation(len(source))
    for start in range(0, len(source), 32):
        picked = order[start:start + 32]
        is_new = source[picked].astype(bool)
        rows = row[picked]
        features = np.empty((len(picked), 8, 247), dtype=np.float32)
        labels = np.empty((len(picked), 8), dtype=np.float32)
        features[~is_new] = old_x[rows[~is_new]]
        labels[~is_new] = old_y[rows[~is_new]]
        features[is_new] = phase_x[rows[is_new]]
        labels[is_new] = phase_y[rows[is_new]]
        scores, cache = network.forward(augment(features, rng), weights, True)
        scores = scores.reshape(-1, 8)
        difference = sigmoid(scores[:, :, None] - scores[:, None, :]) - sigmoid((labels[:, :, None] - labels[:, None, :]) / 5)
        dz = (2 * difference.sum(axis=2) / (len(picked) * 8 * 7)).reshape(-1, 1)
        gradients = network.gradients(cache, dz, weights)
        step += 1
        for key in weights:
            gradient = gradients[key] + (1e-4 * weights[key] if weights[key].ndim == 2 else 0)
            first[key] = .9 * first[key] + .1 * gradient
            second[key] = .999 * second[key] + .001 * gradient * gradient
            weights[key] -= .0002 * (first[key] / (1 - .9 ** step)) / (np.sqrt(second[key] / (1 - .999 ** step)) + 1e-8)
    result = validation(weights)
    history.append({"epoch": epoch, **result})
    print(json.dumps(history[-1]), flush=True)
    if result["equal_phase_mean"] < best - .005:
        best = result["equal_phase_mean"]
        best_epoch = epoch
        stale = 0
        np.savez(OUTPUT / "model.npz", **weights)
    else:
        stale += 1
    if stale >= 4:
        break

report = {"training_old_groups": len(old_train), "training_new_groups": len(new_train),
          "new_group_repeats": repeats, "validation_games": valid_end - train_end,
          "test_games": games - valid_end, "revived_units": revived,
          "baseline_validation": baseline_validation,
          "best_epoch": best_epoch, "history": history}
if best_epoch:
    selected = dict(np.load(OUTPUT / "model.npz"))
    report["selected_validation"] = validation(selected)
    test_sets = {
        "mid": (old_x[old_test], old_y[old_test], old_game[old_test]),
        "opening": (phase_x[new_test & (group % 2 == 0)], phase_y[new_test & (group % 2 == 0)], game[new_test & (group % 2 == 0)]),
        "endgame": (phase_x[new_test & (group % 2 == 1)], phase_y[new_test & (group % 2 == 1)], game[new_test & (group % 2 == 1)]),
    }
    report["test"] = {}
    for name, (features, labels, ids) in test_sets.items():
        old_regret = regret(features, labels, original)
        new_regret = regret(features, labels, selected)
        delta = new_regret - old_regret
        per_game = np.array([delta[ids == value].mean() for value in np.unique(ids)])
        draw = np.random.default_rng(20261003).integers(len(per_game), size=(10000, len(per_game)))
        interval = np.quantile(per_game[draw].mean(axis=1), [.025, .975])
        report["test"][name] = {"groups": len(labels), "baseline_regret": float(old_regret.mean()),
                                "candidate_regret": float(new_regret.mean()), "difference": float(delta.mean()),
                                "game_bootstrap95": interval.tolist()}
(OUTPUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: value for key, value in report.items() if key != "history"}, indent=2), flush=True)
