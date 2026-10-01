#include "../cpp/search.hpp"
#include <chrono>
#include <iostream>

int main(){
 std::mt19937 rng(314159);
 std::vector<std::pair<pw::State,std::vector<pw::State>>> groups;
 for(int game=0;game<16;game++){
  pw::State s;
  for(int i=0;i<33;i++)s.circle.push_back(i);
  std::shuffle(s.circle.begin(),s.circle.end(),rng);
  s.token=(std::find(s.circle.begin(),s.circle.end(),0)-s.circle.begin()+1)%33;
  for(int turn=0;turn<25&&!s.over;turn++){
   if(turn%5==0){
    auto legal=pw::aiLegal(s);std::vector<pw::State> next;
    for(const auto& a:legal)if(a.type!=0){pw::State child=s;pw::apply(child,a);next.push_back(std::move(child));if(next.size()==12)break;}
    if(next.size()>=4)groups.push_back({s,std::move(next)});
   }
   auto legal=pw::aiLegal(s);if(legal.empty())break;
   pw::apply(s,legal[rng()%legal.size()]);
  }
 }
 if(groups.empty())return 1;
 auto start=std::chrono::steady_clock::now();volatile float sink=0;
 constexpr int repeats=100;
 size_t evaluations=0;
 for(int repeat=0;repeat<repeats;repeat++)for(const auto& [root,children]:groups)
  for(const auto& child:children){sink+=contactwide::value(child,root.current);evaluations++;}
 double millis=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
 std::cout<<"groups="<<groups.size()<<" evaluations="<<evaluations<<" scalar_ns="<<millis*1e6/evaluations<<" sink="<<sink<<'\n';
 start=std::chrono::steady_clock::now();sink=0;
 for(int repeat=0;repeat<repeats;repeat++)for(const auto& [root,children]:groups){
  contactwide::CachedOpponent cached(root,root.current);
  for(const auto& child:children)sink+=cached.value(child);
 }
 millis=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();
 std::cout<<"cached_ns="<<millis*1e6/evaluations<<" sink="<<sink<<'\n';
 float maxError=0;int top4Mismatches=0;
 for(const auto& [root,children]:groups){
  contactwide::CachedOpponent cached(root,root.current);
  std::vector<std::pair<float,size_t>> scalar,fast;
  for(size_t i=0;i<children.size();i++){
   float a=contactwide::value(children[i],root.current),b=cached.value(children[i]);
   maxError=std::max(maxError,std::abs(a-b));scalar.push_back({a,i});fast.push_back({b,i});
  }
  auto byScore=[](const auto& a,const auto& b){return a.first>b.first;};
  std::stable_sort(scalar.begin(),scalar.end(),byScore);std::stable_sort(fast.begin(),fast.end(),byScore);
  for(size_t i=0;i<std::min(size_t(4),scalar.size());i++)top4Mismatches+=scalar[i].second!=fast[i].second;
 }
 std::cout<<"max_error="<<maxError<<" top4_rank_mismatches="<<top4Mismatches<<'\n';
}
