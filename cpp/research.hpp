#pragma once
#include "search.hpp"
#include "model/ContactInference.hpp"
namespace pw::research {
using Clock=std::chrono::steady_clock;
using Time=Clock::time_point;
struct Timeout {};
inline void check(Time deadline){if(Clock::now()>=deadline)throw Timeout{};}
inline Bits full(){return (Bits(1)<<81)-1;}
inline Bits neighbors(Bits b){static const Bits left=[](){Bits m=0;for(int y=0;y<9;y++)m|=Bits(1)<<(y*9);return m;}();static const Bits right=left<<8;return (((b&~right)<<1)|((b&~left)>>1)|(b<<9)|(b>>9))&full();}
inline const std::array<Bits,9>& squares(){static const auto masks=[](){std::array<Bits,9> out{};for(int y=0;y<3;y++)for(int x=0;x<3;x++)for(int dy=0;dy<7;dy++)for(int dx=0;dx<7;dx++)out[y*3+x]|=Bits(1)<<((y+dy)*9+x+dx);return out;}();return masks;}
inline int missingSquare(Bits board){int best=49;for(auto mask:squares())best=std::min(best,49-count(mask&board));return best;}
// The 7x7 gap is an integer from 0 to 49; its exponential is state-independent.
inline const std::array<double,50>& bonusExponents(){static const auto values=[](){std::array<double,50> out{};for(int i=0;i<50;i++)out[i]=std::exp(-i/8.);return out;}();return values;}
inline double geometry(Bits board,bool bonus,int missing=-1){Bits empty=full()^board;int isolated=count(empty&~neighbors(empty));int edges=count(empty&neighbors(board));double v=-2.5*isolated-.18*edges;if(bonus)v+=7*bonusExponents()[missing<0?missingSquare(board):missing];return v;}
inline double evaluate(const State& s,int me){if(s.over){int diff=s.players[me].score()-s.players[1-me].score();return diff?diff:(winner(s)==me?.01:-.01);}auto one=[&](int i){const auto& p=s.players[i];int remaining=0;for(int t:incomes)remaining+=t>p.time;return p.score()+p.income*remaining+1.5*(53-p.time)+geometry(p.board,s.bonusOwner<0);};return one(me)-one(1-me);}
inline Bits canonical(Bits b){Bits best=~Bits(0);for(int flip=0;flip<2;flip++)for(int rot=0;rot<4;rot++){Bits t=0;for(int y=0;y<9;y++)for(int x=0;x<9;x++)if(b&(Bits(1)<<(y*9+x))){int xx=flip?8-x:x,yy=y;for(int r=0;r<rot;r++){int old=xx;xx=8-yy;yy=old;}t|=Bits(1)<<(yy*9+xx);}best=std::min(best,t);}return best;}
struct Scored {Action a;double score;};
inline std::vector<Scored> diverse(std::vector<Scored> pool,size_t cap,size_t anchors){if(pool.size()<=cap)return pool;std::vector<Scored> out;while(!pool.empty()&&out.size()<cap){size_t best=0;if(out.size()>=anchors){int far=-1;for(size_t i=0;i<pool.size();i++){int near=82;for(const auto& prior:out)near=std::min(near,count(pool[i].a.mask^prior.a.mask));if(near>far){far=near;best=i;}}}out.push_back(pool[best]);pool.erase(pool.begin()+best);}return out;}
inline std::array<std::vector<Scored>,35> groups(const State& s,int me,Time deadline,bool learned,int& evaluations){std::array<std::vector<Scored>,35> out;for(const auto& a:aiLegal(s)){check(deadline);State next=s;apply(next,a);double score=learned&&a.type!=0?contactwide::value(next,s.current):evaluate(next,me);if(learned&&a.type!=0)evaluations++;int group=a.type==0?34:a.type==2?33:a.piece;out[group].push_back({a,score});}return out;}
inline std::vector<Scored> unique(std::vector<Scored> g,Bits board,Time deadline,size_t max){std::stable_sort(g.begin(),g.end(),[](const auto& a,const auto& b){return a.score>b.score;});std::vector<Bits> keys;std::vector<Scored> out;for(auto& a:g){check(deadline);Bits key=canonical(board|a.a.mask);if(std::find(keys.begin(),keys.end(),key)!=keys.end())continue;keys.push_back(key);out.push_back(a);if(out.size()>=max)break;}return out;}
inline double marketFit(const State& s,int player,Time deadline){if(s.circle.empty())return 0.;Bits board=s.players[player].board;double total=0;int n=std::min(3,int(s.circle.size()));for(int i=0;i<n;i++){int id=s.circle[(s.token+i)%s.circle.size()];auto& masks=placements()[id];if(masks.empty())continue;int fit=0;for(size_t j=0;j<masks.size();j++){fit+=!(masks[j].mask&board);if((j&255)==0)check(deadline);}total+=count(masks.front().mask)*std::sqrt(double(fit)/masks.size());}return total/n;}
inline std::vector<Scored> children(const State& s,int me,Time deadline){int unused=0;auto gs=groups(s,me,deadline,false,unused);bool maximize=s.current==me;std::vector<Scored> first,second;for(auto& group:gs){if(group.empty())continue;std::stable_sort(group.begin(),group.end(),[&](auto& a,auto& b){return maximize?a.score>b.score:a.score<b.score;});auto selected=diverse(unique(std::move(group),s.players[s.current].board,deadline,32),2,1);if(!selected.empty())first.push_back(selected[0]);if(selected.size()>1)second.push_back(selected[1]);}std::stable_sort(second.begin(),second.end(),[&](auto& a,auto& b){return maximize?a.score>b.score:a.score<b.score;});for(auto a:second)if(first.size()<6)first.push_back(a);return first;}
inline double beam(const State& s,int me,int depth,Time deadline){check(deadline);if(s.over)return evaluate(s,me);if(!depth)return evaluate(s,me)+marketFit(s,me,deadline)-marketFit(s,1-me,deadline);bool maximize=s.current==me;double best=maximize?-1e100:1e100;for(const auto& child:children(s,me,deadline)){State next=s;apply(next,child.a);double v=beam(next,me,depth-1,deadline);best=maximize?std::max(best,v):std::min(best,v);}return best;}
inline std::vector<Action> shortlist(const State& s,Time deadline,int& evals){auto gs=groups(s,s.current,deadline,true,evals);std::vector<Scored> roots,fallback;for(auto& group:gs){if(group.empty())continue;auto ranked=unique(std::move(group),s.players[s.current].board,deadline,64);auto selected=diverse(ranked,12,6);roots.insert(roots.end(),selected.begin(),selected.end());auto basic=diverse(std::move(ranked),9,4);fallback.insert(fallback.end(),basic.begin(),basic.end());}for(int horizon=2;horizon<=3;horizon++){std::array<std::vector<Scored>,35> scored;try{for(auto root:roots){check(deadline);State next=s;apply(next,root.a);root.score=beam(next,s.current,horizon-1,deadline);int group=root.a.type==0?34:root.a.type==2?33:root.a.piece;scored[group].push_back(root);}}catch(const Timeout&){break;}fallback.clear();for(auto& group:scored){if(group.empty())continue;std::stable_sort(group.begin(),group.end(),[](auto& a,auto& b){return a.score>b.score;});auto selected=diverse(group,9,4);fallback.insert(fallback.end(),selected.begin(),selected.end());}}std::stable_sort(fallback.begin(),fallback.end(),[](auto& a,auto& b){return a.score>b.score;});std::vector<Action> out;for(auto& item:fallback)out.push_back(item.a);return out;}
// Visit rollout moves in the same order as aiLegal, without materializing the
// full legal-action vector at every simulated turn.
template<class Visit> inline void forEachRolloutLegal(const State& s,Visit&& visit){
 if(s.over)return;
 const auto& player=s.players[s.current];Bits board=player.board;
 if(s.pending){
  for(int i=0;i<81;i++){Bits mask=Bits(1)<<i;if(mask&board)continue;Action a{2,-1,0,i%9,i/9,mask};if(touchesCloth(board,a))visit(a);}
  return;
 }
 visit(Action{});
 for(int i=0;i<std::min(3,int(s.circle.size()));i++){
  int id=s.circle[(s.token+i)%s.circle.size()];if(pieces[id].cost>player.buttons)continue;
  for(const auto& a:placements()[id])if(!(a.mask&board)&&touchesCloth(board,a))visit(a);
 }
}
// A normal turn has at most three market patches plus advance. Each group
// retains two placements and possibly one distinct 7x7-directed placement.
struct RolloutPlacement {Action action;double shape=0;int missing=49;};
struct RolloutGroup {std::array<RolloutPlacement,2> top{};int size=0;RolloutPlacement square{};bool hasSquare=false;};
struct RolloutOption {Action action;double value;int timeAdvance,buttons;};
struct RolloutOptions {std::array<RolloutOption,16> items{};size_t size=0;};
inline RolloutOptions scoredRolloutOptions(const State& s){
 std::array<RolloutGroup,35> groups{};
 Bits board=s.players[s.current].board;bool bonus=s.bonusOwner<0;
 forEachRolloutLegal(s,[&](const Action& a){
  int index=a.type==0?34:a.type==2?33:a.piece;auto& group=groups[index];
  if(a.type==0){group.top[0]={a,0,49};group.size=1;return;}
  Bits next=board|a.mask;int missing=bonus?missingSquare(next):49;
  double shape=geometry(next,bonus,missing);
  RolloutPlacement placement{a,shape,missing};
  int at=0;while(at<group.size&&!(shape>group.top[at].shape))at++;
  if(at<2){if(group.size<2)group.size++;for(int j=group.size-1;j>at;j--)group.top[j]=group.top[j-1];group.top[at]=placement;}
  if(bonus&&(!group.hasSquare||missing<group.square.missing||(missing==group.square.missing&&shape>group.square.shape))){group.square=placement;group.hasSquare=true;}
 });
 RolloutOptions ranked;
 for(auto& group:groups){
  auto add=[&](const RolloutPlacement& placement){
   State next=s;apply(next,placement.action);
   const auto& before=s.players[s.current];const auto& after=next.players[s.current];
   ranked.items[ranked.size++]={placement.action,evaluate(next,s.current),after.time-before.time,after.buttons};
  };
  for(int i=0;i<group.size;i++)add(group.top[i]);
  if(group.hasSquare){bool present=false;for(int i=0;i<group.size;i++)present|=group.top[i].action.mask==group.square.action.mask;if(!present)add(group.square);}
 }
 // At most ten candidates; insertion sort preserves the original stable tie order.
 for(size_t i=1;i<ranked.size;i++){
  auto item=ranked.items[i];size_t j=i;
  while(j>0&&item.value>ranked.items[j-1].value){ranked.items[j]=ranked.items[j-1];j--;}
  ranked.items[j]=item;
 }
 return ranked;
}
inline std::vector<RolloutOption> scoredRolloutCandidates(const State& s){
 auto ranked=scoredRolloutOptions(s);return {ranked.items.begin(),ranked.items.begin()+ranked.size};
}
inline std::vector<Action> rolloutCandidates(const State& s){
 auto ranked=scoredRolloutOptions(s);std::vector<Action> out;out.reserve(ranked.size);
 for(size_t i=0;i<ranked.size;i++)out.push_back(ranked.items[i].action);return out;
}
struct RolloutPowerCache {
 // Exponents remain fixed within a simulation; time advancement is integral.
 std::array<double,2> exponent{};
 std::array<bool,2> exponentKnown{};
 std::array<std::array<double,54>,2> values{};
 std::array<std::array<bool,54>,2> valid{};
 double get(int player,int timeAdvance,const double* exponents){
  if(!exponentKnown[player]||exponent[player]!=exponents[player]){exponentKnown[player]=true;exponent[player]=exponents[player];valid[player].fill(false);}
  int time=std::max(1,timeAdvance);
  if(!valid[player][time]){values[player][time]=std::pow(time,exponents[player]);valid[player][time]=true;}
  return values[player][time];
 }
};
inline Action rolloutAction(const State& s,int me,std::mt19937& rng,const double* exponents){
 static thread_local RolloutPowerCache powerCache;
 auto options=scoredRolloutOptions(s);double base=evaluate(s,me),sign=s.current==me?1.:-1.;
 double best=-1e100;Action chosen=options.items[0].action;
 for(size_t i=0;i<options.size;i++){
  const auto& option=options.items[i];
  // evaluate() is a zero-sum score; reverse the cached perspective if needed.
  double nextValue=me==s.current?option.value:-option.value;
  double gain=sign*(nextValue-base)+1.5*option.timeAdvance;
  double score=gain/powerCache.get(s.current,option.timeAdvance,exponents)+.15*std::min(option.buttons,10);
  score+=std::uniform_real_distribution<double>(-.3,.3)(rng);
  if(score>best){best=score;chosen=option.action;}}
 return chosen;
}
inline Result search(const State& s,int milliseconds,uint32_t seed,bool improvedRollout=false){auto start=Clock::now();Time deadline=start+std::chrono::milliseconds(milliseconds/5);std::vector<Action> roots;int evals=0;try{roots=shortlist(s,deadline,evals);}catch(const Timeout&){}if(roots.empty()){Result fallback;roots=modelCandidates(s,fallback,Time::max(),contactwide::value);evals+=fallback.modelEvaluations;}int spent=int(std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now()-start).count());auto result=pw::search(s,std::max(1,milliseconds-spent),1000000000,seed,&roots,candidates,improvedRollout?rolloutAction:nullptr);result.elapsed=int(std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now()-start).count());result.modelEvaluations+=evals;result.modelUsed=evals>0;return result;}
}
