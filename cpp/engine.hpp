#pragma once
#include "data.hpp"
#include <algorithm>
#include <array>
#include <cstdint>
#include <stdexcept>
namespace pw {
using Bits=unsigned __int128;
inline int count(Bits b){return __builtin_popcountll(static_cast<uint64_t>(b))+__builtin_popcountll(static_cast<uint64_t>(b>>64));}
struct Action {int type=0,piece=-1,orientation=0,x=0,y=0;Bits mask=0;};
struct Player {Bits board=0;int buttons=5,income=0,time=0;bool bonus=false;int score()const{return buttons-2*(81-count(board))+(bonus?7:0);}};
struct State {std::array<Player,2> players;std::vector<int> circle;int token=0,current=0,pending=0,claimed=0,bonusOwner=-1,firstFinished=-1;bool over=false;};
inline const std::vector<std::vector<Action>>& placements(){
 static const auto all=[](){std::vector<std::vector<Action>> out(pieces.size());for(size_t i=0;i<pieces.size();i++)for(size_t f=0;f<pieces[i].forms.size();f++){
  auto& cells=pieces[i].forms[f];int w=0,h=0;for(auto [x,y]:cells){w=std::max(w,x+1);h=std::max(h,y+1);}
  for(int y=0;y<=9-h;y++)for(int x=0;x<=9-w;x++){Bits b=0;for(auto [dx,dy]:cells)b|=Bits(1)<<((y+dy)*9+x+dx);out[i].push_back({1,int(i),int(f),x,y,b});}
 }return out;}();return all;
}
inline std::vector<Action> legal(const State& s){
 std::vector<Action> out;if(s.over)return out;const auto& p=s.players[s.current];
 if(s.pending){for(int i=0;i<81;i++){Bits b=Bits(1)<<i;if(!(b&p.board))out.push_back({2,-1,0,i%9,i/9,b});}return out;}
 out.push_back({});for(int i=0;i<std::min(3,int(s.circle.size()));i++){int id=s.circle[(s.token+i)%s.circle.size()];if(pieces[id].cost<=p.buttons)for(const auto& a:placements()[id])if(!(a.mask&p.board))out.push_back(a);}return out;
}
// AI placements grow the existing quilt. The first piece has no anchor;
// advancing remains available when no purchasable piece touches the quilt.
inline bool touchesCloth(Bits board,const Action& a){
 if(a.type==0||!board)return true;
 static const Bits left=[](){Bits m=0;for(int y=0;y<9;y++)m|=Bits(1)<<(y*9);return m;}();
 static const Bits right=left<<8, full=(Bits(1)<<81)-1;
 Bits neighbors=(((a.mask&~right)<<1)|((a.mask&~left)>>1)|(a.mask<<9)|(a.mask>>9))&full;
 return (neighbors&board)!=0;
}
#ifdef PW_ABLATION
inline bool ablationContactRule=true;
#endif
inline std::vector<Action> aiLegal(const State& s){
 auto actions=legal(s);Bits board=s.players[s.current].board;
#ifdef PW_ABLATION
 if(!ablationContactRule)return actions;
#endif
 actions.erase(std::remove_if(actions.begin(),actions.end(),[&](const Action& a){return !touchesCloth(board,a);}),actions.end());
 return actions;
}
inline void claimBonus(State& s){
 if(s.bonusOwner>=0)return;auto& p=s.players[s.current];
 static const auto masks=[](){std::array<Bits,9> v{};for(int y=0;y<3;y++)for(int x=0;x<3;x++)for(int dy=0;dy<7;dy++)for(int dx=0;dx<7;dx++)v[y*3+x]|=Bits(1)<<((y+dy)*9+x+dx);return v;}();
 for(auto m:masks)if((m&p.board)==m){p.bonus=true;s.bonusOwner=s.current;return;}
}
// Internal: caller must select an action from legal(). ABI validates untrusted actions.
inline void apply(State& s,const Action& a){
 auto& p=s.players[s.current];int old=p.time;
 if(a.type==2){p.board|=a.mask;s.pending--;claimBonus(s);}else{
  if(a.type==0){p.time=std::min(53,s.players[1-s.current].time+1);p.buttons+=p.time-old;}
  else{const auto& q=pieces[a.piece];p.buttons-=q.cost;p.income+=q.income;p.board|=a.mask;auto it=std::find(s.circle.begin(),s.circle.end(),a.piece);int pos=int(it-s.circle.begin());s.circle.erase(it);s.token=s.circle.empty()?0:pos%int(s.circle.size());p.time=std::min(53,old+q.time);claimBonus(s);}
  for(int t:incomes)if(old<t&&p.time>=t)p.buttons+=p.income;
  for(int i=0;i<5;i++)if(!(s.claimed&(1<<i))&&old<leathers[i]&&p.time>=leathers[i]){s.claimed|=1<<i;s.pending++;}
  if(p.time==53&&s.firstFinished<0)s.firstFinished=s.current;
 }
 s.pending=std::min(s.pending,81-count(p.board));if(!s.pending){s.over=s.players[0].time==53&&s.players[1].time==53;if(!s.over&&p.time>s.players[1-s.current].time)s.current=1-s.current;}
}
inline int winner(const State& s){int d=s.players[0].score()-s.players[1].score();return d==0?s.firstFinished:d>0?0:1;}
}
