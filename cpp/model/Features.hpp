#pragma once
#include "../engine.hpp"
namespace learned {
constexpr int inputs=247, context=85, channels=4, encoded=648+context;
using Features=std::array<float,inputs>;
inline Features features(const pw::State& g,int perspective) {
 Features x{};int at=0;
 for(int k=0;k<2;k++)for(int c=0;c<81;c++)x[at++]=float((g.players[perspective^k].board>>c)&1);
 for(int k=0;k<2;k++){const auto& p=g.players[perspective^k];x[at++]=p.buttons/100.f;x[at++]=p.income/30.f;x[at++]=p.time/53.f;x[at++]=p.bonus;}
 x[at++]=g.current==perspective;x[at++]=g.pending>0;x[at++]=g.pending/5.f;
 x[at++]=g.firstFinished==perspective;x[at++]=g.firstFinished==(perspective^1);x[at++]=g.bonusOwner>=0;
 for(int i=0;i<5;i++)x[at++]=(g.claimed>>i)&1;
 for(int i=0;i<int(g.circle.size());i++){int id=g.circle[(g.token+i)%g.circle.size()];x[at+id]=1;x[at+33+id]=1.f/(i+1);}
 return x;
}
}
