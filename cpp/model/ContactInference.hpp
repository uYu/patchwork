#pragma once
#include "Features.hpp"
#include "ContactWeights.hpp"
#include <cmath>
namespace contactwide {
using learned::Features; using learned::features;
constexpr int channels=learned::channels, encoded=learned::encoded, hidden=64;
inline float predict(const Features& x) {
    std::array<float,encoded> z{};
    for(int p=0;p<2;p++)for(int r=0;r<9;r++)for(int c=0;c<9;c++)for(int filter=0;filter<channels;filter++) {
        float v=weights::cb[filter];int index=0;
        for(int channel=0;channel<2;channel++)for(int dr=-1;dr<=1;dr++)for(int dc=-1;dc<=1;dc++,index++) {
            int rr=r+dr,cc=c+dc;
            float input=(rr<0||rr>=9||cc<0||cc>=9)?0.f:(channel==1?1.f:x[p*81+rr*9+cc]);
            v+=input*weights::cw[index*channels+filter];
        }
        z[(p*81+r*9+c)*channels+filter]=std::max(0.f,v);
    }
    std::copy(x.begin()+162,x.end(),z.begin()+648);
    std::array<float,hidden> h{};std::copy(weights::b,weights::b+hidden,h.begin());
    for(int i=0;i<encoded;i++)for(int j=0;j<hidden;j++)h[j]+=z[i]*weights::w[i*hidden+j];
    float logit=weights::o[0];for(int j=0;j<hidden;j++)logit+=std::max(0.f,h[j])*weights::v[j];
    return logit;
}
inline float value(const pw::State& g,int perspective) {
    if(g.over)return pw::winner(g)==perspective?1e6f:-1e6f;
    return predict(features(g,perspective));
}
}
