// Research-only ABI; production search and weights are unaffected.
#include "research.hpp"
#include <random>
extern "C" {
struct AZState {
 uint64_t boards[4];
 int32_t buttons[2],income[2],time[2],bonus[2],circle[33];
 int32_t size,token,current,pending,claimed,bonusOwner,firstFinished,over;
};
struct AZAction { uint64_t low,high;int32_t type,piece,orientation,x,y; };
}
namespace {
pw::State decode(const AZState& x){
 pw::State s;
 for(int i=0;i<2;i++){auto& p=s.players[i];p.board=pw::Bits(x.boards[2*i])|(pw::Bits(x.boards[2*i+1])<<64);p.buttons=x.buttons[i];p.income=x.income[i];p.time=x.time[i];p.bonus=x.bonus[i];}
 s.circle.assign(x.circle,x.circle+x.size);s.token=x.token;s.current=x.current;s.pending=x.pending;s.claimed=x.claimed;s.bonusOwner=x.bonusOwner;s.firstFinished=x.firstFinished;s.over=x.over;return s;
}
void encode(const pw::State& s,AZState& x){
 x={};for(int i=0;i<2;i++){const auto& p=s.players[i];x.boards[2*i]=uint64_t(p.board);x.boards[2*i+1]=uint64_t(p.board>>64);x.buttons[i]=p.buttons;x.income[i]=p.income;x.time[i]=p.time;x.bonus[i]=p.bonus;}
 x.size=s.circle.size();std::copy(s.circle.begin(),s.circle.end(),x.circle);x.token=s.token;x.current=s.current;x.pending=s.pending;x.claimed=s.claimed;x.bonusOwner=s.bonusOwner;x.firstFinished=s.firstFinished;x.over=s.over;
}
pw::Action action(const AZAction& a){return {a.type,a.piece,a.orientation,a.x,a.y,pw::Bits(a.low)|(pw::Bits(a.high)<<64)};}
bool valid(const AZState& x){if(x.size<0||x.size>33||x.current<0||x.current>1||x.token<0||(x.size&&x.token>=x.size))return false;for(int i=0;i<x.size;i++){if(x.circle[i]<0||x.circle[i]>=33)return false;for(int j=0;j<i;j++)if(x.circle[i]==x.circle[j])return false;}return true;}
}
extern "C" {
int az_state_size(){return sizeof(AZState);}
int az_action_size(){return sizeof(AZAction);}
void az_initial(AZState* x,uint32_t seed){pw::State s;for(int i=0;i<33;i++)s.circle.push_back(i);std::mt19937 rng(seed);std::shuffle(s.circle.begin(),s.circle.end(),rng);s.token=(std::find(s.circle.begin(),s.circle.end(),0)-s.circle.begin()+1)%33;encode(s,*x);}
int az_legal(const AZState* x,AZAction* out,int capacity,int contact){if(!valid(*x))return -1;auto s=decode(*x);auto actions=contact?pw::aiLegal(s):pw::legal(s);if(out){if(capacity<int(actions.size()))return -2;for(size_t i=0;i<actions.size();i++){const auto& a=actions[i];out[i]={uint64_t(a.mask),uint64_t(a.mask>>64),a.type,a.piece,a.orientation,a.x,a.y};}}return actions.size();}
int az_apply(const AZState* x,const AZAction* raw,AZState* out,int contact){if(!valid(*x))return -1;auto s=decode(*x);auto a=action(*raw);auto actions=contact?pw::aiLegal(s):pw::legal(s);bool found=false;for(const auto& b:actions)if(a.type==b.type&&a.piece==b.piece&&a.orientation==b.orientation&&a.x==b.x&&a.y==b.y&&a.mask==b.mask){found=true;break;}if(!found)return -2;pw::apply(s,a);encode(s,*out);return 0;}
int az_winner(const AZState* x){if(!valid(*x)||!x->over)return -1;return pw::winner(decode(*x));}
int az_advanced(const AZState* x,AZAction* out,int budget,uint32_t seed,int* simulations,int* elapsed){
 if(!valid(*x)||x->over||budget<1)return -1;
 try{auto s=decode(*x);auto result=pw::research::search(s,budget,seed,true);const auto& a=result.action;
 *out={uint64_t(a.mask),uint64_t(a.mask>>64),a.type,a.piece,a.orientation,a.x,a.y};*simulations=result.simulations;*elapsed=result.elapsed;return 0;}catch(...){return -2;}
}

}
