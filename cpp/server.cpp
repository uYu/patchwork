#include "research.hpp"
#include <iostream>

namespace {
pw::State decode(const std::vector<int>& input){
 pw::State s;int k=0;
 for(auto& p:s.players){
  for(int i=0;i<81;i++)if(input[k++]>=0)p.board|=pw::Bits(1)<<i;
  p.buttons=input[k++];p.income=input[k++];p.time=input[k++];p.bonus=input[k++]!=0;
 }
 s.current=input[k++];s.pending=input[k++];s.claimed=input[k++];
 s.bonusOwner=input[k++];s.firstFinished=input[k++];s.over=input[k++]!=0;
 s.token=input[k++];int count=input[k++];
 for(int i=0;i<count;i++)s.circle.push_back(input[k++]);
 return s;
}
void action(const pw::Action& a,std::vector<int>& out,int at){
 out[at]=a.type;out[at+1]=a.piece;out[at+2]=a.orientation;
 out[at+3]=a.x;out[at+4]=a.y;
}
}

int main(){
 try{
  int mode=0,length=0;uint32_t seed=0;
  if(!(std::cin>>mode>>seed>>length)||length<178||length>211||(mode<0||mode>1))return 2;
  std::vector<int> input(length);
  for(int& value:input)if(!(std::cin>>value))return 2;
  if(input[177]<0||input[177]>33||length!=178+input[177]||input[170]<0||input[170]>1||input[175])return 2;
  auto state=decode(input);
  auto result=mode?pw::research::search(state,5000,seed,true,true):pw::search(state,0,0,seed);
  std::vector<int> out(10+7*result.candidates.size());
  action(result.action,out,0);
  out[5]=result.simulations;out[6]=result.elapsed;
  out[7]=result.modelEvaluations;out[8]=result.modelUsed;
  out[9]=int(result.candidates.size());
  for(size_t i=0;i<result.candidates.size();i++){
   const auto& candidate=result.candidates[i];int at=10+7*i;
   action(candidate.action,out,at);out[at+5]=candidate.visits;
   out[at+6]=candidate.visits?int(10000*candidate.value/candidate.visits):0;
  }
  std::cout<<"{\"values\":[";
  for(size_t i=0;i<out.size();i++)std::cout<<(i?",":"")<<out[i];
  std::cout<<"]}\n";
  return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
