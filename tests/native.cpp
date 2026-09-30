#include "../cpp/research.hpp"
#include <cassert>
#include <iostream>
int main(){
 for(unsigned seed=0;seed<40;seed++){
  pw::State s;for(int i=0;i<33;i++)s.circle.push_back(i);std::mt19937 rng(seed);std::shuffle(s.circle.begin(),s.circle.end(),rng);s.token=(std::find(s.circle.begin(),s.circle.end(),0)-s.circle.begin()+1)%33;
  int steps=0;while(!s.over){
   auto reference=pw::aiLegal(s);std::vector<pw::Action> direct;
   pw::research::forEachRolloutLegal(s,[&](const pw::Action& a){direct.push_back(a);});
   assert(reference.size()==direct.size());
   for(size_t i=0;i<reference.size();i++){
    const auto& a=reference[i];const auto& b=direct[i];
    assert(a.type==b.type&&a.piece==b.piece&&a.orientation==b.orientation&&a.x==b.x&&a.y==b.y&&a.mask==b.mask);
   }
   auto actions=pw::legal(s);assert(!actions.empty());auto a=actions[rng()%actions.size()];pw::apply(s,a);assert(++steps<=120);
   for(auto p:s.players){assert(p.buttons>=0);assert(p.time<=53);assert(pw::count(p.board)<=81);}
  }
  assert(pw::legal(s).empty());assert(pw::winner(s)>=0);
 }
 for(int missing=0;missing<50;missing++)assert(pw::research::bonusExponents()[missing]==std::exp(-missing/8.));
 pw::research::RolloutPowerCache powers;
 for(const auto& exponents:{std::array<double,2>{.73,1.07},std::array<double,2>{.91,.83}}){
  for(int player=0;player<2;player++)for(int time=0;time<=53;time++)
   assert(powers.get(player,time,exponents.data())==std::pow(std::max(1,time),exponents[player]));
 }
 pw::State s;for(int i=0;i<33;i++)s.circle.push_back(i);auto r=pw::search(s,0,16,1);assert(r.simulations==16);assert(r.action.type>=0);
 pw::State near;near.pending=1;for(int y=0;y<7;y++)for(int x=0;x<7;x++)if(x||y)near.players[0].board|=pw::Bits(1)<<(y*9+x);
 auto directed=pw::research::rolloutCandidates(near);assert(std::any_of(directed.begin(),directed.end(),[](const pw::Action& a){return a.type==2&&a.x==0&&a.y==0;}));
 pw::State contact;contact.players[0].board=pw::Bits(1);contact.pending=1;
 assert(pw::legal(contact).size()==80);
 auto connected=pw::aiLegal(contact);assert(connected.size()==2);
 for(const auto& a:connected)assert(pw::touchesCloth(contact.players[0].board,a));
 contact.pending=0;contact.circle={0};contact.players[0].buttons=100;
 auto candidates=pw::aiLegal(contact);assert(!candidates.empty());
 for(const auto& a:candidates)assert(pw::touchesCloth(contact.players[0].board,a));
 std::cout<<"40 native full games, MCTS and bonus-directed rollout passed\n";
}
