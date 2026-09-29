# Connected-placement ranker used by Advanced AI

`ContactWeights.hpp` is copied from the connected-rule training result at
`learning/contact16k/models/16000/Weights.hpp` in the development workspace.
Source SHA256: `74e203eeb4c0907a512448e9d5c040d9f622a529986bcf9cd28781cb68327701`.

The 47,117-parameter model was trained on 16,000 games sampled under the
connected-placement AI rule. Each legal placement is evaluated once; the
Advanced AI retains at most 9 placements per patch after beam lookahead.
