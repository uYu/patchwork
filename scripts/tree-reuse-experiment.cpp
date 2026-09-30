#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <numeric>
#include <random>
#include <string>
#include <vector>
#include "../cpp/research.hpp"
using namespace pw;

bool sameState(const State& a,const State& b){
 if(a.circle!=b.circle||a.token!=b.token||a.current!=b.current||a.pending!=b.pending||a.claimed!=b.claimed||a.bonusOwner!=b.bonusOwner||a.firstFinished!=b.firstFinished||a.over!=b.over)return false;
 for(int i=0;i<2;i++){const auto& x=a.players[i];const auto& y=b.players[i];if(x.board!=y.board||x.buttons!=y.buttons||x.income!=y.income||x.time!=y.time||x.bonus!=y.bonus)return false;}
 return true;
}
bool sameAction(const Action& a,const Action& b){return a.type==b.type&&a.piece==b.piece&&a.orientation==b.orientation&&a.x==b.x&&a.y==b.y;}
struct Stats {long turns=0,reused=0,hitOwn=0,triesOwn=0,hitOther=0,triesOther=0,retainedVisits=0,simulations=0;};
struct Session {
 std::unique_ptr<Node> root;int perspective=-1;bool persistent;int shortlistMs;Stats stats;
 Session(bool keep,int shortlistBudget):persistent(keep),shortlistMs(shortlistBudget){}
 void prepare(const State& s,int me){
  if(!persistent||!root||perspective!=me||!sameState(root->state,s)){
   root=std::make_unique<Node>(s,Action{},candidates);perspective=me;
   Result unused;std::vector<Action> ranked;
   if(shortlistMs>0){
    int evaluations=0;
    try{ranked=research::shortlist(s,std::chrono::steady_clock::now()+std::chrono::milliseconds(shortlistMs),evaluations);}catch(const research::Timeout&){}
   }
   if(ranked.empty())ranked=modelCandidates(s,unused,std::chrono::steady_clock::time_point::max());
   if(!ranked.empty()){root->untried=std::move(ranked);std::reverse(root->untried.begin(),root->untried.end());}
  }else{stats.reused++;stats.retainedVisits+=root->visits;}
  stats.turns++;
 }
 Action run(const State& s,int me,uint32_t seed,int addedSimulations){
  prepare(s,me);std::mt19937 rng(seed);
  for(int simulation=0;simulation<addedSimulations;simulation++){
   Node* node=root.get();std::vector<Node*> path{node};
   while(node->untried.empty()&&!node->children.empty()&&!node->state.over){
    double best=-1e99;Node* chosen=nullptr;double sign=node->state.current==me?1:-1;
    for(auto& c:node->children){double u=sign*c->value/c->visits+1.4*std::sqrt(std::log(node->visits+1.)/c->visits);if(u>best){best=u;chosen=c.get();}}
    node=chosen;path.push_back(node);
   }
   if(!node->state.over&&!node->untried.empty()){
    Action a=node->untried.back();node->untried.pop_back();State next=node->state;apply(next,a);
    node->children.push_back(std::make_unique<Node>(std::move(next),a,candidates));node=node->children.back().get();path.push_back(node);
   }
   State sim=node->state;int steps=0;
   double exponents[2]={std::uniform_real_distribution<double>(.7,1.1)(rng),std::uniform_real_distribution<double>(.7,1.1)(rng)};
   while(!sim.over&&steps++<128)apply(sim,research::rolloutAction(sim,me,rng,exponents));
   double reward=sim.over?(winner(sim)==me?1.:-1.):0.;
   for(auto* n:path){n->visits++;n->value+=reward;}
   stats.simulations++;
  }
  if(root->children.empty())return root->untried.back();
  auto it=std::max_element(root->children.begin(),root->children.end(),[](const auto& a,const auto& b){return a->visits<b->visits;});
  return (*it)->action;
 }
 void advance(const Action& a,const State& next,bool own){
  if(!persistent||!root)return;
  if(own)stats.triesOwn++;else stats.triesOther++;
  auto it=std::find_if(root->children.begin(),root->children.end(),[&](const auto& c){return sameAction(c->action,a)&&sameState(c->state,next);});
  if(it==root->children.end()){root.reset();return;}
  if(own)stats.hitOwn++;else stats.hitOther++;
  root=std::move(*it);
 }
};
struct Summary {int games=0,reuseWins=0,freshWins=0,draws=0,reuseMargin=0,totalMoves=0;Stats stats;};
int probe(int positions,int simulations){
 long ownHits=0,secondHits=0,ownVisits=0,secondVisits=0;
 for(int i=0;i<positions;i++){
  unsigned seed=unsigned(i);
  State s;s.circle.resize(pieces.size());std::iota(s.circle.begin(),s.circle.end(),0);std::mt19937 rng(seed+200);std::shuffle(s.circle.begin(),s.circle.end(),rng);s.token=(std::find(s.circle.begin(),s.circle.end(),0)-s.circle.begin()+1)%s.circle.size();
  Session session(true,50);Action a=session.run(s,s.current,seed+1,simulations);State next=s;apply(next,a);session.advance(a,next,true);
  int first=session.root?session.root->visits:0;ownHits+=first>0;ownVisits+=first;s=next;
  int secondActor=s.current;Action second=candidates(s).front();next=s;apply(next,second);session.advance(second,next,secondActor==0);
  int retained=session.root?session.root->visits:0;secondHits+=retained>0;secondVisits+=retained;
  std::printf("position=%d nextActor=%d ownVisits=%d afterNextVisits=%d\n",i,secondActor,first,retained);
 }
 std::printf("PROBE positions=%d simulations=%d ownHits=%ld nextHits=%ld ownMean=%.1f nextMean=%.1f nextFraction=%.4f\n",positions,simulations,ownHits,secondHits,double(ownVisits)/positions,double(secondVisits)/positions,double(secondVisits)/positions/simulations);
 return 0;
}
int main(int argc,char** argv){
 if(argc>1&&std::string(argv[1])=="probe"){
  int positions=argc>2?std::atoi(argv[2]):12;int simulations=argc>3?std::atoi(argv[3]):20000;
  if(positions<=0||simulations<=0){std::fprintf(stderr,"usage: %s probe [positions>0] [simulations>0]\n",argv[0]);return 2;}
  return probe(positions,simulations);
 }
 int games=argc>1?std::atoi(argv[1]):12;int simulations=argc>2?std::atoi(argv[2]):500;int shortlistMs=argc>3?std::atoi(argv[3]):0;Summary sum;
 if(games<=0||simulations<=0||shortlistMs<0){std::fprintf(stderr,"usage: %s [games>0] [simulations>0] [shortlist-ms>=0]\n",argv[0]);return 2;}
 auto begin=std::chrono::steady_clock::now();
 for(int game=0;game<games;game++){
  unsigned seed=unsigned(game/2+100);int reuseSeat=game%2;
  State s;s.circle.resize(pieces.size());std::iota(s.circle.begin(),s.circle.end(),0);std::mt19937 order(seed);std::shuffle(s.circle.begin(),s.circle.end(),order);s.token=(std::find(s.circle.begin(),s.circle.end(),0)-s.circle.begin()+1)%s.circle.size();
  Session reuse(true,shortlistMs),fresh(false,shortlistMs);int turn=0;
  while(!s.over&&turn<120){
   bool use=s.current==reuseSeat;auto& agent=use?reuse:fresh;int actor=s.current;
   Action a=agent.run(s,actor,seed*1000+turn,simulations);State next=s;apply(next,a);
   reuse.advance(a,next,use);s=std::move(next);turn++;
  }
  if(!s.over){std::printf("unfinished game %d\n",game);return 1;}
  int victor=winner(s);sum.games++;sum.reuseWins+=victor==reuseSeat;sum.freshWins+=victor!=reuseSeat;sum.draws+=s.players[0].score()==s.players[1].score();sum.reuseMargin+=s.players[reuseSeat].score()-s.players[1-reuseSeat].score();sum.totalMoves+=turn;
  auto& d=sum.stats;auto& t=reuse.stats;d.turns+=t.turns;d.reused+=t.reused;d.hitOwn+=t.hitOwn;d.triesOwn+=t.triesOwn;d.hitOther+=t.hitOther;d.triesOther+=t.triesOther;d.retainedVisits+=t.retainedVisits;d.simulations+=t.simulations;
  std::printf("game=%d seed=%u reuseSeat=%d winner=%s score=%d:%d reuseTurns=%ld reused=%ld opponentHits=%ld/%ld\n",game,seed,reuseSeat,victor==reuseSeat?"reuse":"fresh",s.players[reuseSeat].score(),s.players[1-reuseSeat].score(),t.turns,t.reused,t.hitOther,t.triesOther);
  std::fflush(stdout);
 }
 double secs=std::chrono::duration<double>(std::chrono::steady_clock::now()-begin).count();auto t=sum.stats;
 std::printf("TOTAL games=%d simsPerMove=%d shortlistMs=%d seconds=%.1f reuseWins=%d freshWins=%d tiedScores=%d margin=%d moves=%d reuseTurns=%ld reused=%ld ownHits=%ld/%ld opponentHits=%ld/%ld averageRetainedVisits=%.1f\n",sum.games,simulations,shortlistMs,secs,sum.reuseWins,sum.freshWins,sum.draws,sum.reuseMargin,sum.totalMoves,t.turns,t.reused,t.hitOwn,t.triesOwn,t.hitOther,t.triesOther,t.reused?double(t.retainedVisits)/t.reused:0.);
}
