"""Build an isolated search copy that switches only the convolution kernel."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".build" / "tiny-match"
(OUT / "model").mkdir(parents=True, exist_ok=True)
for name in ("data.hpp", "engine.hpp", "search.hpp", "research.hpp"):
    shutil.copy2(ROOT / "cpp" / name, OUT / name)
for name in ("Features.hpp", "ContactWeights.hpp", "tiny_nn.h"):
    shutil.copy2(ROOT / "cpp" / "model" / name, OUT / "model" / name)

source = (ROOT / "cpp" / "model" / "ContactInference.hpp").read_text()
needle = "inline void convolveBoard(const Features& x,int player,float* output){\n"
assert source.count(needle) == 1
old_kernel = """inline bool useTinyConv=true;
inline void convolveBoard(const Features& x,int player,float* output){
    if(!useTinyConv){
        for(int r=0;r<9;r++)for(int c=0;c<9;c++)for(int filter=0;filter<channels;filter++){
            float v=weights::cb[filter];int index=0;
            for(int channel=0;channel<2;channel++)for(int dr=-1;dr<=1;dr++)for(int dc=-1;dc<=1;dc++,index++){
                int rr=r+dr,cc=c+dc;
                float input=(rr<0||rr>=9||cc<0||cc>=9)?0.f:(channel==1?1.f:x[player*81+rr*9+cc]);
                v+=input*weights::cw[index*channels+filter];
            }
            output[(r*9+c)*channels+filter]=std::max(0.f,v);
        }
        return;
    }
"""
source = source.replace(needle, old_kernel)
(OUT / "model" / "ContactInference.hpp").write_text(source)
shutil.copy2(ROOT / "scripts" / "tiny-model-match.cpp", OUT / "match.cpp")
print(OUT)
