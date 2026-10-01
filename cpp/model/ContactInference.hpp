#pragma once
#include "Features.hpp"
#include "ContactWeights.hpp"
#include "tiny_nn.h"
#include <cmath>
namespace contactwide {
using learned::Features; using learned::features;
constexpr int channels=learned::channels, encoded=learned::encoded, hidden=36;
constexpr int boardInputs=2*81, boardEncoded=2*81*channels;
inline void convolveBoard(const Features& x,int player,float* output){
    for(int r=0;r<9;r++)for(int c=0;c<9;c++){
        float values[channels];std::copy(weights::cb,weights::cb+channels,values);
        int index=0;
        for(int channel=0;channel<2;channel++)for(int dr=-1;dr<=1;dr++)for(int dc=-1;dc<=1;dc++,index++){
            const int rr=r+dr,cc=c+dc;
            const float input=(rr<0||rr>=9||cc<0||cc>=9)?0.f:(channel==1?1.f:x[player*81+rr*9+cc]);
            tiny_nn::axpy(values,weights::cw+index*channels,input,channels);
        }
        for(int filter=0;filter<channels;filter++)output[(r*9+c)*channels+filter]=std::max(0.f,values[filter]);
    }
}
inline float predict(const Features& x) {
    std::array<float,encoded> z{};
    for(int p=0;p<2;p++)convolveBoard(x,p,z.data()+p*81*channels);
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
// Successors of one position keep the other player's board unchanged. Reuse
// its convolution and dense-layer contribution across those predictions.
struct CachedOpponent {
    int perspective;
    std::array<float,hidden> contribution{};
    explicit CachedOpponent(const pw::State& parent,int player):perspective(player) {
        const auto x=features(parent,player);
        std::array<float,81*channels> z{};convolveBoard(x,1,z.data());
        for(int i=0;i<81*channels;i++)for(int j=0;j<hidden;j++)
            contribution[j]+=z[i]*weights::w[(81*channels+i)*hidden+j];
    }
    float value(const pw::State& g) const {
        if(g.over)return pw::winner(g)==perspective?1e6f:-1e6f;
        const auto x=features(g,perspective);
        std::array<float,hidden> h{};std::copy(weights::b,weights::b+hidden,h.begin());
        std::array<float,81*channels> z{};convolveBoard(x,0,z.data());
        for(int i=0;i<81*channels;i++)for(int j=0;j<hidden;j++)h[j]+=z[i]*weights::w[i*hidden+j];
        for(int j=0;j<hidden;j++)h[j]+=contribution[j];
        for(int i=boardEncoded;i<encoded;i++)for(int j=0;j<hidden;j++)h[j]+=x[i-boardEncoded+boardInputs]*weights::w[i*hidden+j];
        float logit=weights::o[0];for(int j=0;j<hidden;j++)logit+=std::max(0.f,h[j])*weights::v[j];
        return logit;
    }
};
}
