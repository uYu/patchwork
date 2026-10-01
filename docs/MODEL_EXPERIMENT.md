# Connected-placement model architecture screen

The released ranker stores 26,537 parameters after pruning. Three isolated
architecture changes were trained on its 16,000 connected-rule source games:
one extra 3×3 residual convolution (`residual4`), per-board mean and max pooling
(`pool4`), and a wider first convolution with 16 channels (`conv16`). All start
from the released model's unpruned source checkpoint. The new branches or
channels preserve its initial predictions to within 2e-5.

All runs use the same 500 validation games and 500 test games, separate by
whole game from training. The optimizer, augmentation, and checkpoint rule
(validation pairwise log loss) match the original connected-model training.
The promotion decision below is based on validation Top-2 regret; test results
are diagnostic. Smaller regret is better.

| Model | Trained params | Pruned params | Validation Top-2 regret | Test Top-2 regret |
| --- | ---: | ---: | ---: | ---: |
| Released source model | 47,117 | 26,537 | **1.543** | 1.599 |
| `residual4` | 47,265 | 20,070 | 1.589 | 1.572 |
| `pool4` | 48,141 | 20,354 | 1.565 | 1.582 |
| `conv16` | 171,761 | 72,638 | 1.566 | 1.558 |

All three worsen the validation ranking metric. Their test gains are also
uncertain: whole-game paired bootstrap 95% intervals for the test regret
difference (new minus baseline) are `[-0.089, 0.036]` for `residual4`,
`[-0.077, 0.044]` for `pool4`, and `[-0.104, 0.024]` for `conv16`. Each interval
crosses zero. No candidate qualifies for release on this screen, and none was
timed or tested in gameplay. The observed test improvements should not be used
to choose an architecture after looking at all three results.

The pruned experimental checkpoints have score parity within 2e-6 on 50
held-out candidate groups. Pruning removes hidden units whose output weights
are below 1e-30. The model files and machine-readable reports are in
`.build/<variant>-contact16k/`, outside version control.

Reproduce from the parent `patchwork` workspace with the sibling `learning`
directory present and a Python runtime with NumPy:

```sh
python3 release/scripts/experiment-rankers.py residual4
python3 release/scripts/experiment-rankers.py pool4
python3 release/scripts/experiment-rankers.py conv16
```

The existing corpus samples only midgame positions where both players' clocks
are in `[6, 49)`, and each label compares eight placements of one patch. The
next data experiment should add opening and endgame positions and evaluate
ranking against the full legal candidate set. Keep whole-game splits, then
run paired opening matches under the browser's time budget before promoting
any replacement.

## Opening and endgame data screen

`scripts/generate-phase-data.cpp` uses the same connected source-play and
16-rollout labeling policy as the original corpus. Each new source game supplies
one opening group when both clocks are below 8 and one endgame group when both
clocks are at least 40 but below 53, if a patch has eight legal connected
placements. Opening seeds start at 4,300,000, separate from the original
connected corpus. The 10,000 generated games yielded 10,000 opening groups and
9,995 endgame groups. Whole games 0–7,999 train, 8,000–8,999 validate, and
9,000–9,999 are reserved for testing. All validation and test games have both
groups.

`scripts/experiment-phase-training.py` starts from the 16,000-game connected
checkpoint and mixes all 48,000 original training groups with 15,995 new phase
groups. It selects a checkpoint only when the equal-weight mean Top-2 regret
over the three validation phases improves by at least 0.005. A second run
reinitializes 34 dormant dense units with zero output weights, preserving
initial scores to within 2e-5.

| Validation Top-2 regret | Midgame | Opening | Endgame | Equal-phase mean |
| --- | ---: | ---: | ---: | ---: |
| Released source model | 1.543 | 1.687 | 0.901 | **1.377** |
| Ordinary fine-tune, best observed | 1.544 | 1.704 | 0.886 | 1.378 |
| Dormant-unit reset, best observed | 1.568 | 1.692 | 0.867 | 1.375 |

The reset run's mean gain is about 0.0014, below the selection threshold, and
opening regret worsens. Neither run selected a checkpoint. Their reserved
test labels were not evaluated. A 3,000-game pilot and a small validation-only
blend with the existing geometry score also failed to give a stable improvement.
The current evidence points to training targets and candidate sampling as the
next issues to investigate; simply widening or continuing to fine-tune the
current ranker has not produced a reliable gain.

The corpus and reports stay under `.build/`. Reproduce the larger screen from
the parent workspace with a C++17 compiler and NumPy installed:

```sh
clang++ -std=c++17 -O2 -pthread release/scripts/generate-phase-data.cpp -o release/.build/generate-phase-data
release/.build/generate-phase-data 10000 4 release/.build/phase10k 4300000
python3 release/scripts/experiment-phase-training.py release/.build/phase10k
python3 release/scripts/experiment-phase-training.py release/.build/phase10k --revive
```

## Native head-to-head for the wider model

The `conv16` checkpoint was exported with its 27 active hidden units (72,638
parameters) and compared against the released 26,537-parameter model. The
experiment copies the release C++ rules and search into `.build/model-match/`
and changes only the function used to rank placements. Python/C++ score parity
over 40 held-out examples had maximum error 1.43e-6. Both agents use connected
placements, the same rollout policy, the same time limit per decision, and
swapped seats for each opening.

At 1 second per decision, 10 paired openings (20 games, seeds 5,100,000–
5,100,009) gave `conv16` 13 wins and 7 losses. Four openings were swept by
`conv16`, one by the released model, and five split. The paired exact two-sided
test has p=0.375; the paired bootstrap 95% win-rate interval is [45%, 85%].
Mean score margin was +1.25 points with paired interval [-3.10, 5.25]. Mean
decision time was 1,027 ms for both agents; `conv16` averaged 977,177 search
simulations per move versus 1,044,741 for the released model. This is a
promising screen, not enough evidence for promotion.

At the browser's 5-second decision budget, two fresh paired openings (four
games, seeds 5,200,000–5,200,001) split 2–2. Each opening split 1–1. The wider
model's mean score margin was +3.75 points, but four games cannot resolve its
win rate. Mean decision time was 5,168 ms for `conv16` and 5,156 ms for the
released model. The 1-second advantage did not replicate in this small
5-second check. Neither match result justifies replacing the deployed model.

Reproduce the native comparison from the parent workspace:

```sh
python3 release/scripts/prepare-model-match.py
clang++ -std=c++17 -O2 -pthread release/.build/model-match/match.cpp -o release/.build/model-match/match
release/.build/model-match/match --parity release/.build/model-match/parity.bin
release/.build/model-match/match 10 1000 5100000 > release/.build/model-match/pilot1s.jsonl
python3 release/scripts/analyze-model-match.py release/.build/model-match/pilot1s.jsonl
release/.build/model-match/match 2 5000 5200000 > release/.build/model-match/pilot5s.jsonl
python3 release/scripts/analyze-model-match.py release/.build/model-match/pilot5s.jsonl
```

## Model ranking at the first internal search level

The advanced search previously used the model to rank root placements only.
The new search policy also ranks placements when a root action is expanded.
For each patch group it first keeps the 12 highest heuristic placements, scores
those successor states with the released model, then keeps four purchases or
eight leather placements. The root shortlist, deeper tree levels, UCT rule,
rollouts, model weights, and time budget are unchanged. This is limited to the
advanced search; the normal difficulty retains its original candidate policy.

An isolated copy of the native engine compared the new policy with the old one
using identical seeds and swapped seats. At one second per decision, ten paired
openings (20 games, seeds 6,100,100–6,100,109) yielded 13–7 for the new policy.
At the browser's five-second budget, two fresh paired openings (four games,
seeds 6,200,000–6,200,001) split 2–2; each opening split 1–1. Mean five-second
score margin was +0.5 points. The new policy averaged 5.149 seconds, 4.91
million simulations, and 399 model evaluations per decision versus 5.126
seconds, 6.17 million simulations, and 77 model evaluations for the old policy.
The reduced simulation count is the cost of extra inference. These small matches
do not establish statistical noninferiority, but show no observed disadvantage
at the target budget. The user chose observed non-worsening as the release rule.

A fresh one-second retest used the current cached/SIMD inference build for both
agents and switched only first-internal-level model ranking. On the same ten
paired opening seeds, the enhanced policy again won **13–7** (four enhanced
sweeps, one baseline sweep, five splits). Mean score margin was +2.0 points;
the paired exact two-sided p-value was 0.375 and paired bootstrap 95% win-rate
interval was [45%, 85%]. The enhanced side averaged 469 model evaluations and
969,707 simulations per decision, versus 87 evaluations and 1,078,346
simulations for root-only ranking. This confirms the observation on the current
native build, not a statistically established strength gain. Both sides used
the same model weights, root shortlist, rollout, and one-second budget.

A larger five-second match completed 100 paired openings (200 games, seeds
6,200,000–6,200,099) with two concurrent native match processes. Each opening
was played with swapped seats. The first two seeds overlap the earlier
four-game pilot; excluding them leaves the conclusion unchanged. The enhanced
root-plus-first-level policy won **115–85** (57.5%, paired-opening bootstrap
95% interval 51.5%–63.5%). It swept 27 openings, the root-only policy swept
12, and 61 split; the exact two-sided test on decisive pairs gives p=0.0237.
The mean final score margin was +0.795 points, with paired 95% interval
[-0.525, +2.12], so the score-margin advantage remains uncertain. The
enhanced side averaged 5.127 seconds, 4.727 million simulations, and 531
model evaluations per decision; root-only averaged 5.134 seconds, 4.900
million simulations, and 103 model evaluations. With the two pilot seeds
removed, the enhanced policy won 113–83 (57.65% over 196 games). The complete
results and analysis are in `.build/depth-one-match/200x5s-6200000/`.

```sh
python3 release/scripts/prepare-depth-one-match.py
clang++ -std=c++17 -O3 -march=native release/.build/depth-one-match/match.cpp -o release/.build/depth-one-match/match
release/.build/depth-one-match/match 10 1000 6100100 > release/.build/depth-one-match/pilot1s.jsonl
python3 release/scripts/analyze-model-match.py release/.build/depth-one-match/pilot1s.jsonl
```

The inference speed experiment caches the convolution and dense-layer
contribution of the unchanged opponent board across sibling placements. On 62
native candidate groups (737 distinct successors, 73,700 timed evaluations),
scalar inference took 3.91 µs per successor and cached inference 1.99 µs,
including cache setup. The maximum score difference was 4.8e-7 and none of
the groups changed its top-four order. On eight fixed positions with a
one-second search budget, simulations changed from 282,486 to 283,413, about
0.3%. Inference is a small fraction of total search time, so batching the
4–12 sibling candidates is unlikely to materially improve whole-move speed.
The next performance target should be candidate generation or rollouts.

The Jaipur `cpp/tiny_nn.h` header was also screened for this model. Its
`axpy` operation fits the input-major 733×36 dense layer without transposing
weights; `linear` and `matvec` expect output-major weights. On Apple Silicon
NEON, `axpy` improved the isolated dense layer, but on Wasm SIMD128 it was
essentially tied. Transposing weights to call `linear` was slower on Wasm.
The useful application was the 3×3 convolution: each input position has four
contiguous filter weights, so `axpy` updates all four filters in one SIMD
operation. In an isolated full-prediction benchmark under Node/Wasm SIMD128,
this changed 3.05 µs to 2.31 µs per prediction with identical scores on the
sampled features. The header now lives in `cpp/model/tiny_nn.h` and powers
the convolution in both normal and cached inference. The Linux-native service
uses the same implementation, with the backend selected at compile time. On
Apple Silicon, the integrated cached predictor took about 1.18 µs per
successor on the same 62-group benchmark (versus 1.99 µs before vectorizing
the convolution); the maximum scalar/cached difference remained 4.8e-7 and
the top-four ranking was unchanged. Linux performance depends on the server
CPU and compiler flags.

Reproduce the speed checks:

```sh
clang++ -std=c++17 -O3 -march=native release/scripts/benchmark-model-inference.cpp -o release/.build/benchmark-model-inference
release/.build/benchmark-model-inference
python3 release/scripts/prepare-internal-model-match.py
clang++ -std=c++17 -O2 -Irelease/cpp release/scripts/benchmark-search-speed.cpp -o release/.build/benchmark-search-cached
clang++ -std=c++17 -O2 -DBENCH_LEGACY_INTERNAL -Irelease/.build/internal-model-match release/scripts/benchmark-search-speed.cpp -o release/.build/benchmark-search-scalar
release/.build/benchmark-search-scalar
release/.build/benchmark-search-cached
```

## One-second native match for the SIMD convolution

An isolated copy of the current engine switches only between the `tiny_nn`
four-filter convolution and the previous scalar loop. Both sides use the same
weights, cached-opponent inference, first-level model ranking, root shortlist,
rollouts, and one-second budget. On Apple Silicon NEON, ten paired openings
(20 games, seeds 7,100,000–7,100,009) finished **10–10**: one opening swept by
each kernel and eight split 1–1. Mean score margin for SIMD was +0.1 points;
the paired exact two-sided p-value is 1.0. The SIMD side averaged 1,003,502
simulations and 457 model evaluations per decision, versus 1,013,001 and 466
for scalar. These complete-game averages reflect different later positions.

On eight identical fixed positions, two alternating one-second passes gave
scalar 272,673 and 262,502 simulations, and SIMD 263,767 and 271,930.
The averages are essentially equal; run-to-run timing noise exceeds their
difference. At about 450 model calls per decision, saving roughly 0.8 µs per
call saves less than 0.5 ms of a one-second turn. SIMD speeds up individual
predictions but has no demonstrated whole-search or playing-strength effect at
this budget. The native service keeps the SIMD path because the paired match
showed no observed disadvantage. This was measured on Apple Silicon; the Linux
build still needs a target-CPU benchmark.

Reproduce from the parent workspace:

```sh
python3 release/scripts/prepare-tiny-match.py
clang++ -std=c++17 -O3 -march=native release/.build/tiny-match/match.cpp -o release/.build/tiny-match/match
release/.build/tiny-match/match 10 1000 7100000 > release/.build/tiny-match/pilot1s.jsonl
python3 release/scripts/analyze-model-match.py release/.build/tiny-match/pilot1s.jsonl
clang++ -std=c++17 -O3 -march=native -Irelease/.build/tiny-match release/scripts/benchmark-tiny-search.cpp -o release/.build/tiny-match/benchmark
release/.build/tiny-match/benchmark 0
release/.build/tiny-match/benchmark 1
```

For training, collect candidate groups from states actually reached at the
first internal level, stratified by opening, midgame, endgame, leather, and
consecutive-turn positions. Include heuristic top candidates and model mistakes
as hard negatives, label siblings with repeated searches using shared rollout
seeds, and split by whole source game before selecting a checkpoint. Evaluate
Top-4 recall or regret on the full candidate group and confirm with paired
five-second matches.

### Next sample pilot

The old 16k corpus presents eight placements of **one** patch per group, with
16 connected-policy terminal rollouts per placement. Its pairwise target is
terminal **score margin**, not the near-saturated win/loss number shown in the
MCTS replay. Adding opening and endgame groups without changing this candidate
construction did not improve the equal-phase validation result. The next pilot
should change the decision distribution and label reliability first:

1. Log full states actually encountered by the released five-second search at
   the root and after its first expansion. Generate the traces from paired
   openings against several policies (current advanced, legacy root-only, and a perturbed
   placement policy), retaining the source game and opening seed. Stratify by
   search depth, game phase, pending leather, and consecutive turns, rather than
   taking three arbitrary midgame states from each game.
2. At each state, retain the production candidate group: geometry-ranked,
   model-ranked, and diverse placements for each available patch. Add a small
   uniform sample of legal connected placements and the best candidates that
   the current model would discard. This measures whether the shortlist misses
   good moves, instead of only comparing moves it already likes. Deduplicate
   symmetric successor boards within a group.
3. Give siblings equal initial rollout budgets under the current C++ rollout
   policy and shared seed schedule. Record terminal margin, win/loss, bonus,
   and the variance of each label. Spend additional independent rollouts on
   close or contradictory candidates; use an untouched set of seeds to check
   any apparent winner. Keep margin as the ranking target and treat win/loss as
   an auxiliary outcome, since it saturates in positions where all moves win.
4. Split by whole opening/source game **before** generating candidate labels.
   On held-out groups report Top-4/Top-9 recall and regret for the exact
   production shortlist, separately for root and first-level states and for
   each phase. Only then compare the candidate model with the released one in
   swapped-seat five-second games. The replacement criterion is no meaningful
   degradation in the paired match plus improved shortlist regret, not a lower
   training loss alone.

Begin with a small pilot to inspect coverage and label disagreement. Save raw
states and candidate actions alongside features so that a changed teacher or
rollout policy can relabel the same decisions without regenerating games.
