#!/usr/bin/env python3
"""Prepare an isolated native match that ranks depth-one tree actions by model."""

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / ".build" / "internal-model-match"
MODEL = TARGET / "model"
MODEL.mkdir(parents=True, exist_ok=True)
for name in ("data.hpp", "engine.hpp", "search.hpp", "research.hpp"):
    shutil.copyfile(ROOT / "cpp" / name, TARGET / name)
for name in ("Features.hpp", "ContactInference.hpp", "ContactWeights.hpp"):
    shutil.copyfile(ROOT / "cpp/model" / name, MODEL / name)

search = (TARGET / "search.hpp").read_text()
marker = "using CandidatePolicy=std::vector<Action>(*)(const State&);"
assert search.count(marker) == 1
experiment = """
inline bool useCandidate=false;
inline int internalModelEvaluations=0;
inline std::vector<Action> internalModelCandidates(const State& s) {
 std::array<std::vector<std::pair<double,Action>>,35> groups;
 for(const auto& a:aiLegal(s)) {
  int group=a.type==0?34:a.type==2?33:a.piece;
  groups[group].push_back({priority(s,a),a});
 }
 std::vector<Action> chosen;
 for(auto& group:groups) {
  std::stable_sort(group.begin(),group.end(),[](const auto& x,const auto& y){return x.first>y.first;});
  if(group.size()>12)group.resize(12);
  std::vector<std::pair<float,Action>> ranked;
  for(const auto& item:group) {
   if(item.second.type==0){chosen.push_back(item.second);continue;}
   State next=s;apply(next,item.second);
   ranked.push_back({contactwide::value(next,s.current),item.second});
   internalModelEvaluations++;
  }
  std::stable_sort(ranked.begin(),ranked.end(),[](const auto& x,const auto& y){return x.first>y.first;});
  int cap=!ranked.empty()&&ranked[0].second.type==2?8:4;
  for(int i=0;i<std::min(cap,int(ranked.size()));i++)chosen.push_back(ranked[i].second);
 }
 std::stable_sort(chosen.begin(),chosen.end(),[&](const auto& x,const auto& y){return priority(s,x)>priority(s,y);});
 return chosen;
}
"""
search = search.replace(marker, experiment + marker)
old = "Node(State s,Action a={},CandidatePolicy policy=candidates):state(std::move(s)),untried(policy(state)),action(a)"
new = "int depth=0;Node(State s,Action a={},CandidatePolicy policy=candidates,int d=0):state(std::move(s)),untried(useCandidate&&d==1?internalModelCandidates(state):policy(state)),action(a),depth(d)"
assert search.count(old) == 1
search = search.replace(old, new)
old = "std::make_unique<Node>(std::move(next),a,policy)"
new = "std::make_unique<Node>(std::move(next),a,policy,node->depth+1)"
assert search.count(old) == 1
search = search.replace(old, new)
(TARGET / "search.hpp").write_text(search)

research = (TARGET / "research.hpp").read_text()
old = "inline Result search(const State& s,int milliseconds,uint32_t seed,bool improvedRollout=false){auto start=Clock::now();"
new = "inline Result search(const State& s,int milliseconds,uint32_t seed,bool improvedRollout=false){internalModelEvaluations=0;auto start=Clock::now();"
assert research.count(old) == 1
research = research.replace(old, new)
old = "result.modelEvaluations+=evals;result.modelUsed=evals>0;return result;"
new = "result.modelEvaluations+=evals+internalModelEvaluations;result.modelUsed=result.modelEvaluations>0;return result;"
assert research.count(old) == 1
research = research.replace(old, new)
(TARGET / "research.hpp").write_text(research)
shutil.copyfile(ROOT / "scripts/internal-model-match.cpp", TARGET / "match.cpp")
print(f"prepared {TARGET}")
