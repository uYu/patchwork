#pragma once
#include "engine.hpp"
#include "model/ContactInference.hpp"
#include <chrono>
#include <cmath>
#include <memory>
#include <random>
namespace pw {
inline double priority(const State& s,const Action& a){
 const auto& p=s.players[s.current];
 if(a.type==0){int dist=std::min(53,s.players[1-s.current].time+1)-p.time;return 0.5+double(dist)/(dist+1);}
 // Adjacency to existing cloth or the quilt edge encourages compact placement.
 static const Bits left=[](){Bits m=0;for(int i=0;i<9;i++)m|=Bits(1)<<(9*i);return m;}();
 static const Bits right=left<<8, full=(Bits(1)<<81)-1;
 const Bits occupied=p.board|a.mask;
 const Bits neighbors=((a.mask&~left)>>1)|((a.mask&~right)<<1)|(a.mask>>9)|((a.mask<<9)&full);
 const int contact=count(neighbors&p.board)+count(a.mask&left)+count(a.mask&right)+count(a.mask&511)+count(a.mask&(Bits(511)<<72));
 const Bits empty=full&~occupied;
 const Bits adjacentEmpty=((empty&~left)>>1)|((empty&~right)<<1)|(empty>>9)|((empty<<9)&full);
 const int isolated=count(empty&~adjacentEmpty);
 if(a.type==2)return contact*.22-isolated*.8;
 const auto& q=pieces[a.piece];int future=0;for(int t:incomes)if(t>p.time)future++;
 double gain=2*count(a.mask)-q.cost+q.income*future;
 return gain/(1.5+std::min(q.time,53-p.time))+.12*contact-.8*isolated;
}
inline std::vector<Action> candidates(const State& s){
 auto acts=aiLegal(s);std::vector<std::pair<double,Action>> ranked;ranked.reserve(acts.size());
 for(auto a:acts)ranked.push_back({priority(s,a),a});
 std::stable_sort(ranked.begin(),ranked.end(),[](const auto& a,const auto& b){return a.first>b.first;});
 // Retain several placements for every affordable patch and always retain advance.
 std::array<int,35> used{};std::vector<Action> out;
 for(const auto& [v,a]:ranked){(void)v;int group=a.type==0?34:a.type==2?33:a.piece;int cap=a.type==2?8:4;if(used[group]++<cap)out.push_back(a);}
 return out;
}
using CandidatePolicy=std::vector<Action>(*)(const State&);
using RolloutPolicy=Action(*)(const State&,int,std::mt19937&,const double*);
struct Node {State state;std::vector<Action> untried;std::vector<std::unique_ptr<Node>> children;Action action;int visits=0;double value=0;Node(State s,Action a={},CandidatePolicy policy=candidates):state(std::move(s)),untried(policy(state)),action(a){std::reverse(untried.begin(),untried.end());}};
struct Candidate { Action action; int visits=0; double value=0; };
struct Result{std::vector<Candidate> candidates; Action action;int simulations=0;int elapsed=0;int modelEvaluations=0;int modelUsed=0;int rootCandidates=0;};
inline std::vector<Action> modelCandidates(const State& s,Result& result,std::chrono::steady_clock::time_point deadline,float(*modelValue)(const State&,int)=contactwide::value){
 std::array<std::vector<std::pair<float,Action>>,35> groups;
 for(const auto& a:aiLegal(s)){
  if(std::chrono::steady_clock::now()>=deadline)return {}; // Discard incomplete rankings.
  float score=0;
  if(a.type!=0){State next=s;apply(next,a);score=modelValue(next,s.current);result.modelEvaluations++;}
  const int group=a.type==0?34:a.type==2?33:a.piece;
  auto& best=groups[group];auto at=std::find_if(best.begin(),best.end(),[&](const auto& p){return score>p.first;});
  best.insert(at,{score,a});if(best.size()>8)best.pop_back();
 }
 std::vector<Action> out;for(const auto& group:groups)for(const auto& item:group)out.push_back(item.second);
 std::stable_sort(out.begin(),out.end(),[&](const auto& a,const auto& b){return priority(s,a)>priority(s,b);});
 result.modelUsed=result.modelEvaluations>0;return out;
}
inline Result search(const State& s,int milliseconds,int limit,uint32_t seed,const std::vector<Action>* roots=nullptr,CandidatePolicy policy=candidates,RolloutPolicy rollout=nullptr){
 const auto start=std::chrono::steady_clock::now();auto elapsed=[&](){return int(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count());};
 Node root(s,{},policy);if(root.untried.empty())throw std::runtime_error("No legal action");
 Result result;result.action=root.untried.back();if(limit==0){for(auto it=root.untried.rbegin();it!=root.untried.rend();++it)result.candidates.push_back({*it});result.rootCandidates=int(result.candidates.size());result.elapsed=elapsed();return result;}
 auto ranked=roots?*roots:modelCandidates(s,result,milliseconds>0?start+std::chrono::milliseconds(milliseconds/5):std::chrono::steady_clock::time_point::max());
 if(!ranked.empty()){root.untried=std::move(ranked);std::reverse(root.untried.begin(),root.untried.end());}
 result.rootCandidates=int(root.untried.size());result.action=root.untried.back();
 for(auto it=root.untried.rbegin();it!=root.untried.rend();++it)result.candidates.push_back({*it});
 std::mt19937 rng(seed);int me=s.current;
 while(result.simulations<limit&&(milliseconds<=0||elapsed()<milliseconds)){
  Node* node=&root;std::vector<Node*> path{node};
  while(node->untried.empty()&&!node->children.empty()&&!node->state.over){
   double best=-1e99;Node* chosen=nullptr;double sign=node->state.current==me?1:-1;
   for(auto& c:node->children){double u=sign*c->value/c->visits+1.4*std::sqrt(std::log(node->visits+1.)/c->visits);if(u>best){best=u;chosen=c.get();}}
   node=chosen;path.push_back(node);
  }
  if(!node->state.over&&!node->untried.empty()){
   Action a=node->untried.back();node->untried.pop_back();State next=node->state;apply(next,a);node->children.push_back(std::make_unique<Node>(std::move(next),a,policy));node=node->children.back().get();path.push_back(node);
  }
  State sim=node->state;int steps=0;
  double exponents[2]={};if(rollout){exponents[0]=std::uniform_real_distribution<double>(.7,1.1)(rng);exponents[1]=std::uniform_real_distribution<double>(.7,1.1)(rng);}
  while(!sim.over&&steps++<128){if(rollout){apply(sim,rollout(sim,me,rng,exponents));continue;}auto acts=policy(sim);if(acts.empty())break;size_t i=(rng()%10==0)?rng()%acts.size():rng()%std::min(size_t(3),acts.size());apply(sim,acts[i]);}
  double reward=sim.over?(winner(sim)==me?1.:-1.):0.;
  for(auto* n:path){n->visits++;n->value+=reward;}result.simulations++;
 }
 if(!root.children.empty()){auto it=std::max_element(root.children.begin(),root.children.end(),[](const auto& a,const auto& b){return a->visits<b->visits;});result.action=(*it)->action;}
 for(auto& candidate:result.candidates)for(const auto& child:root.children){
  const auto& a=candidate.action;const auto& b=child->action;
  if(a.type==b.type&&a.piece==b.piece&&a.orientation==b.orientation&&a.x==b.x&&a.y==b.y){candidate.visits=child->visits;candidate.value=child->value;break;}
 }
 result.elapsed=elapsed();return result;
}
}
