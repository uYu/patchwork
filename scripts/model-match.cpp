#include "research.hpp"
#include <fstream>
#include <iostream>

int main(int argc,char** argv) {
 if(argc==3&&std::string(argv[1])=="--parity") {
  std::ifstream in(argv[2],std::ios::binary);if(!in)return 2;
  float maximum=0;int cases=0;
  while(true) {
   std::array<float,248> row{};
   in.read(reinterpret_cast<char*>(row.data()),sizeof(row));
   if(!in){if(in.eof()&&in.gcount()==0)break;return 3;}
   learned::Features features{};std::copy(row.begin(),row.begin()+247,features.begin());
   maximum=std::max(maximum,std::abs(candidatewide::predict(features)-row[247]));cases++;
  }
  std::cout<<"parity_cases="<<cases<<" max_error="<<maximum<<'\n';
  return cases==40&&maximum<2e-5f?0:4;
 }
 if(argc!=4)return 2;
 int pairs=std::stoi(argv[1]),budget=std::stoi(argv[2]),firstSeed=std::stoi(argv[3]);
 if(pairs<1||budget<1)return 2;
 for(int seed=firstSeed;seed<firstSeed+pairs;seed++)for(int newSide=0;newSide<2;newSide++) {
  pw::State state;for(int i=0;i<33;i++)state.circle.push_back(i);
  std::mt19937 shuffle(seed);std::shuffle(state.circle.begin(),state.circle.end(),shuffle);
  state.token=(std::find(state.circle.begin(),state.circle.end(),0)-state.circle.begin()+1)%33;
  int steps=0,newTurns=0,oldTurns=0,newEvals=0,oldEvals=0;
  long long newElapsed=0,oldElapsed=0,newSimulations=0,oldSimulations=0;
  while(!state.over) {
   bool newer=state.current==newSide;pw::useCandidate=newer;
   auto result=pw::research::search(state,budget,uint32_t(seed*100003+steps*7919+17),true);
   if(!pw::touchesCloth(state.players[state.current].board,result.action))return 3;
   if(newer){newTurns++;newElapsed+=result.elapsed;newSimulations+=result.simulations;newEvals+=result.modelEvaluations;}
   else{oldTurns++;oldElapsed+=result.elapsed;oldSimulations+=result.simulations;oldEvals+=result.modelEvaluations;}
   pw::apply(state,result.action);
   if(++steps>120)return 4;
  }
  const auto& newer=state.players[newSide];const auto& older=state.players[1-newSide];
  std::cout<<"{\"seed\":"<<seed<<",\"newSide\":"<<newSide
           <<",\"newWin\":"<<(pw::winner(state)==newSide)
           <<",\"newScore\":"<<newer.score()<<",\"oldScore\":"<<older.score()
           <<",\"newTurns\":"<<newTurns<<",\"oldTurns\":"<<oldTurns
           <<",\"newElapsedMs\":"<<newElapsed<<",\"oldElapsedMs\":"<<oldElapsed
           <<",\"newSimulations\":"<<newSimulations<<",\"oldSimulations\":"<<oldSimulations
           <<",\"newModelEvals\":"<<newEvals<<",\"oldModelEvals\":"<<oldEvals
           <<"}"<<std::endl;
 }
}
