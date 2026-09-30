# MCTS tree reuse experiment

## Question

Should the AI keep its MCTS tree across real moves? Today, `pw::search` creates a new root on every call. The app also creates and terminates a Worker for each AI turn, so shipping reuse would require persistent Worker state and a way to promote a child after every real action.

## Method

`scripts/tree-reuse-experiment.cpp` implements a native prototype. The reuse player promotes a matching child after each action and checks the entire resulting game state before accepting it. Its opponent reconstructs the root on every turn. Both use the current candidate and improved rollout policies, get **500 new simulations per decision**, and swap seats for each shuffled market seed. Each result below covers 50 seeds and both seat assignments (100 games). This fixes simulation count, **not wall time**. The prototype is not the exact five-second browser search.

Build on the development Mac:

```sh
clang++ -std=c++17 -O3 \
  -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk \
  -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 \
  scripts/tree-reuse-experiment.cpp -o /tmp/patchwork-tree-reuse-experiment
```

Run the two match variants:

```sh
/tmp/patchwork-tree-reuse-experiment 100 500
/tmp/patchwork-tree-reuse-experiment 100 500 50
```

Without the third argument, new roots use `modelCandidates`. With it, new roots get a 50 ms `research::shortlist` budget and fall back to `modelCandidates` when needed. On a reused root, the existing child's heuristic candidate list is retained. This difference in root candidate selection also affects the match result, so the wins cannot be attributed solely to retained MCTS statistics. The shortlist variant has a time limit, so exact outcomes can vary with machine load.

| Root selection | Reuse wins | Fresh wins | Score ties | Reused decisions | Opponent-action child hits | Mean visits at reused root |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Model candidates | 56 | 44 | 1 | 1,573 / 2,105 | 1,353 / 1,785 | 149.6 |
| 50 ms shortlist | 57 | 43 | 7 | 1,514 / 2,090 | 1,297 / 1,777 | 146.7 |

Score ties are included in the win columns because the game applies its first-finisher tie break. Neither 56–44 nor 57–43 is strong enough evidence of a playing-strength improvement from only 100 games.

## Large-search retention probe

```sh
/tmp/patchwork-tree-reuse-experiment probe 12 20000
```

For 12 shuffled initial markets, the prototype ran 20,000 simulations, promoted its chosen action, then promoted the first heuristic candidate for the opponent's next action. All 12 positions passed the full-state child check at both steps. On average, 12,025 visits remained after the AI action, and 562 after the opponent action: **2.81% of the original 20,000 simulations**. The opponent action is a heuristic stand-in, not a sample of human play. The fixed set of 12 openings also does not characterize every midgame position.

## Decision

Keep the current fresh-tree implementation for now. Tree reuse is feasible, but the measured playing-strength gain is inconclusive and little of a large opening search survives the opponent's move in this probe. A production change should first show a clear gain in a larger, equal-wall-time match test with the actual browser search budget; it would also need persistent Worker lifecycle and tree invalidation when the game is reset or settings change.
