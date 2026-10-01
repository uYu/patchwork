#include "research.hpp"
#include <iostream>

int main(int argc,char** argv){
 if(argc!=2)return 2;
 contactwide::useTinyConv=std::stoi(argv[1])!=0;
 std::mt19937 rng(271828);std::vector<pw::State> states;
 for(int game=0;game<4;game++){
  pw::State s;for(int i=0;i<33;i++)s.circle.push_back(i);
  std::shuffle(s.circle.begin(),s.circle.end(),rng);
  s.token=(std::find(s.circle.begin(),s.circle.end(),0)-s.circle.begin()+1)%33;
  for(int turn=0;turn<28&&!s.over;turn++){
   if(turn==4||turn==16)states.push_back(s);
   auto legal=pw::aiLegal(s);if(legal.empty())break;
   pw::apply(s,legal[rng()%legal.size()]);
  }
 }
 long long simulations=0,evaluations=0,elapsed=0;
 for(size_t i=0;i<states.size();i++){
  auto result=pw::research::search(states[i],1000,uint32_t(i+917),true);
  simulations+=result.simulations;evaluations+=result.modelEvaluations;elapsed+=result.elapsed;
 }
 std::cout<<"tiny="<<contactwide::useTinyConv<<" positions="<<states.size()
          <<" simulations="<<simulations<<" model_evaluations="<<evaluations
          <<" elapsed_ms="<<elapsed<<'\n';
}
