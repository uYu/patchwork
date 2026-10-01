"""Make an isolated copy that switches first-internal-level model ranking."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".build" / "depth-one-match"
(OUT / "model").mkdir(parents=True, exist_ok=True)
for name in ("data.hpp", "engine.hpp", "research.hpp"):
    shutil.copy2(ROOT / "cpp" / name, OUT / name)
for name in ("Features.hpp", "ContactWeights.hpp", "ContactInference.hpp", "tiny_nn.h"):
    shutil.copy2(ROOT / "cpp" / "model" / name, OUT / "model" / name)

source = (ROOT / "cpp" / "search.hpp").read_text()
needle = "int internalEvals=0;int* internalCounter=modelAtDepthOne?&internalEvals:nullptr;"
assert source.count(needle) == 1
source = source.replace("using CandidatePolicy=", "inline bool useInternalModel=true;\nusing CandidatePolicy=", 1)
source = source.replace(needle, "int internalEvals=0;int* internalCounter=modelAtDepthOne&&useInternalModel?&internalEvals:nullptr;")
(OUT / "search.hpp").write_text(source)
shutil.copy2(ROOT / "scripts" / "depth-one-model-match.cpp", OUT / "match.cpp")
print(OUT)
