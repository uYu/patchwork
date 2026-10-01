# Connected-placement ranker used by Advanced AI

The original `ContactWeights.hpp` was copied from the connected-rule training
result at `learning/contact16k/models/16000/Weights.hpp` in the development
workspace. Training source SHA256:
`74e203eeb4c0907a512448e9d5c040d9f622a529986bcf9cd28781cb68327701`.

The original 47,117-parameter model was trained on 16,000 games sampled under
the connected-placement AI rule. The checked-in weights retain the 36 hidden
units whose output weights are at least `1e-30` in magnitude, leaving 26,537
parameters. `scripts/prune-contact-weights.py` reproduces the transformation
from the original header (SHA256 `20b8f804063d4c3ecd0416917dc768bbe2893ee01b07039a8ee19173a2ec8dc1`).
The Advanced AI ranks legal root placements and a heuristic-prefiltered set
at the first internal search level. It retains at most 9 root placements per
patch after beam lookahead. `tiny_nn.h` was copied from the sibling Jaipur
project's `cpp/tiny_nn.h`; its `axpy` helper updates four convolution filters
together on NEON and Wasm SIMD128 builds.
