#include "research.hpp"
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define API EMSCRIPTEN_KEEPALIVE
#else
#define API
#endif
namespace {
int input[256],output[20000];
pw::State decode(){pw::State s;int k=0;for(auto& p:s.players){for(int i=0;i<81;i++)if(input[k++]>=0)p.board|=pw::Bits(1)<<i;p.buttons=input[k++];p.income=input[k++];p.time=input[k++];p.bonus=input[k++]!=0;}s.current=input[k++];s.pending=input[k++];s.claimed=input[k++];s.bonusOwner=input[k++];s.firstFinished=input[k++];s.over=input[k++]!=0;s.token=input[k++];int n=input[k++];for(int i=0;i<n;i++)s.circle.push_back(input[k++]);return s;}
void encode(const pw::State& s){int k=0;for(auto& p:s.players){for(int i=0;i<81;i++)input[k++]=(p.board&(pw::Bits(1)<<i))?0:-1;input[k++]=p.buttons;input[k++]=p.income;input[k++]=p.time;input[k++]=p.bonus;}input[k++]=s.current;input[k++]=s.pending;input[k++]=s.claimed;input[k++]=s.bonusOwner;input[k++]=s.firstFinished;input[k++]=s.over;input[k++]=s.token;input[k++]=int(s.circle.size());for(int id:s.circle)input[k++]=id;}
void action(const pw::Action& a,int* out){out[0]=a.type;out[1]=a.piece;out[2]=a.orientation;out[3]=a.x;out[4]=a.y;}
}
extern "C" {
API double pw_model_score(int perspective){return contactwide::predict(learned::features(decode(),perspective));}
API int* pw_input(){return input;}
API int* pw_output(){return output;}
API int pw_legal(){auto acts=pw::legal(decode());for(size_t i=0;i<acts.size();i++)action(acts[i],output+i*5);return int(acts.size());}
API int pw_step(int type,int piece,int orientation,int x,int y){auto s=decode();for(auto a:pw::legal(s))if(a.type==type&&(type==0||(a.x==x&&a.y==y&&(type==2||(a.piece==piece&&a.orientation==orientation))))){pw::apply(s,a);encode(s);return 1;}return 0;}
API int pw_search(int ms,int limit,unsigned seed){auto s=decode();if(s.over)return 0;auto r=limit<0?pw::research::search(s,ms,seed,true):pw::search(s,ms,limit,seed);action(r.action,output);output[5]=r.simulations;output[6]=r.elapsed;output[7]=r.modelEvaluations;output[8]=r.modelUsed;output[9]=int(r.candidates.size());for(size_t i=0;i<r.candidates.size();i++){const auto& c=r.candidates[i];int* out=output+10+i*7;action(c.action,out);out[5]=c.visits;out[6]=c.visits?int(10000*c.value/c.visits):0;}return 1;}
}
