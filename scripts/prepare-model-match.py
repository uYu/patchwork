#!/usr/bin/env python3
"""Build an isolated native search tree for the conv16 versus release match."""

import importlib.util
from pathlib import Path
import shutil

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / ".build" / "model-match"
MODEL = TARGET / "model"
MODEL.mkdir(parents=True, exist_ok=True)

for name in ("data.hpp", "engine.hpp", "search.hpp", "research.hpp"):
    shutil.copyfile(ROOT / "cpp" / name, TARGET / name)
for name in ("Features.hpp", "ContactInference.hpp", "ContactWeights.hpp"):
    shutil.copyfile(ROOT / "cpp/model" / name, MODEL / name)

weights = dict(np.load(ROOT / ".build/conv16-contact16k/pruned-model.npz"))
assert weights["cw"].shape == (18, 16)
assert weights["w"].shape == (2677, 27)
assert weights["v"].shape == (27, 1)
header = ["#pragma once", "namespace candidatewide { namespace weights {"]
for name, values in weights.items():
    flat = values.ravel()
    header.append(f"inline constexpr float {name}[{len(flat)}] = {{")
    for start in range(0, len(flat), 8):
        header.append("  " + ", ".join(f"{float(value):.9e}f" for value in flat[start:start + 8]) + ",")
    header.append("};")
header.append("}}")
(MODEL / "CandidateWeights.hpp").write_text("\n".join(header) + "\n")

inference = (MODEL / "ContactInference.hpp").read_text()
replacements = {
    '#include "ContactWeights.hpp"': '#include "CandidateWeights.hpp"',
    "namespace contactwide {": "namespace candidatewide {",
    "constexpr int channels=learned::channels, encoded=learned::encoded, hidden=36;":
        "constexpr int channels=16, encoded=162*channels+learned::context, hidden=27;",
    "z.begin()+648": "z.begin()+162*channels",
}
for old, new in replacements.items():
    assert inference.count(old) == 1, old
    inference = inference.replace(old, new)
(MODEL / "CandidateInference.hpp").write_text(inference)

search = (TARGET / "search.hpp").read_text()
assert search.count('#include "model/ContactInference.hpp"') == 1
search = search.replace('#include "model/ContactInference.hpp"',
                        '#include "model/ContactInference.hpp"\n#include "model/CandidateInference.hpp"')
assert search.count("namespace pw {") == 1
search = search.replace("namespace pw {", "namespace pw {\n"
    "inline bool useCandidate=false;\n"
    "inline float rankValue(const State& s,int player){return useCandidate?candidatewide::value(s,player):contactwide::value(s,player);}")
needle = "modelCandidates(s,result,milliseconds>0?start+std::chrono::milliseconds(milliseconds/5):std::chrono::steady_clock::time_point::max())"
assert search.count(needle) == 1
search = search.replace(needle, needle[:-1] + ",rankValue)")
(TARGET / "search.hpp").write_text(search)

research = (TARGET / "research.hpp").read_text()
assert research.count("contactwide::value(next,s.current)") == 1
research = research.replace("contactwide::value(next,s.current)", "rankValue(next,s.current)")
assert research.count("modelCandidates(s,fallback,Time::max(),contactwide::value)") == 1
research = research.replace("modelCandidates(s,fallback,Time::max(),contactwide::value)",
                            "modelCandidates(s,fallback,Time::max(),rankValue)")
(TARGET / "research.hpp").write_text(research)
shutil.copyfile(ROOT / "scripts/model-match.cpp", TARGET / "match.cpp")

learning = ROOT.parent / "learning"
spec = importlib.util.spec_from_file_location("architecture", learning / "architecture100k/network.py")
arch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(arch)
corpus = np.load(learning / "contact16k/data/corpus.npz")
features = corpus["x"][:5].reshape(-1, 247).astype("<f4")
scores = arch.forward(features, weights, "conv16").astype("<f4")
np.concatenate((features, scores), axis=1).astype("<f4").tofile(TARGET / "parity.bin")
print(f"prepared {TARGET}; parity cases={len(scores)}")
