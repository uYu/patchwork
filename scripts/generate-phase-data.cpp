#include "../../learning/ValueModel.hpp"
#include "../../learning/contact16k/ConnectedV2RolloutPolicy.hpp"
#include <fstream>
#include <iostream>
#include <filesystem>
#include <mutex>
#include <atomic>
#include <numeric>
static PatchworkGame restore(const learned::Features& x) {
    PatchworkGame g(ALL_PIECES);
    for(int p=0;p<2;p++) {
        for(int c=0;c<81;c++)if(x[p*81+c]>.5f)g.players[p].board|=uint128(1)<<c;
        g.players[p].buttons=std::lround(x[162+4*p]*100);g.players[p].income=std::lround(x[163+4*p]*30);
        g.players[p].time_pos=std::lround(x[164+4*p]*53);g.players[p].has_7x7_bonus=x[165+4*p]>.5f;
    }
    g.current_player_idx=x[170]>.5f?0:1;g.pending_leather=x[171]>.5f;g.pending_leather_count=std::lround(x[172]*5);
    g.first_finished=x[173]>.5f?0:(x[174]>.5f?1:-1);g.bonus_claimed=x[175]>.5f;
    for(int i=0;i<5;i++)g.leather_claimed[i]=x[176+i]>.5f;
    std::vector<std::pair<int,int>> market;
    for(int id=0;id<33;id++)if(x[181+id]>.5f)market.emplace_back(std::lround(1/x[214+id])-1,id);
    std::sort(market.begin(),market.end());g.pieces_circle.clear();for(auto p:market)g.pieces_circle.push_back(p.second);
    g.token_idx=0;
    auto check=learned::features(g,0);for(int i=0;i<learned::inputs;i++)if(std::abs(check[i]-x[i])>1e-5)throw std::runtime_error("state reconstruction mismatch");
    return g;
}
static std::pair<float,float> rollout(PatchworkGame g,int perspective,unsigned seed) {
    V2RolloutPolicy::Context c{std::chrono::steady_clock::now()+std::chrono::seconds(30),perspective,{}, {}};
    std::mt19937 rng(seed);
    double exponents[2]={std::uniform_real_distribution<double>(.7,1.1)(rng),std::uniform_real_distribution<double>(.7,1.1)(rng)};
    for(int step=0;!g.game_over;step++) {
        if(step>120)throw std::runtime_error("rollout too long");
        auto a=V2RolloutPolicy::policy(g,ALL_PIECES,c,rng,exponents);
        if(a.type!=0&&!V2RolloutPolicy::touches(g.players[g.current_player_idx].board,a.mask))throw std::runtime_error("disconnected label rollout");
        g.apply_legal_action(a,ALL_PIECES);
    }
    return {float(g.players[perspective].get_score()-g.players[1-perspective].get_score()),g.winner()==perspective?1.f:0.f};
}

static std::atomic<int> completed{0};
static std::mutex output_mutex;
static unsigned openingBase=4100000;
static unsigned opening(int id) {
    return openingBase+id;
}
static void generate_game(int id,std::ofstream& out,std::ofstream& log) {
    unsigned seed=opening(id);std::mt19937 game_rng(seed);
    PatchworkGame g(ALL_PIECES);std::shuffle(g.pieces_circle.begin(),g.pieces_circle.end(),game_rng);
    g.token_idx=(std::find(g.pieces_circle.begin(),g.pieces_circle.end(),0)-g.pieces_circle.begin()+1)%g.pieces_circle.size();
    V2RolloutPolicy ai[2]={{.002,128,seed+1,1},{.002,128,seed+2,1}};
    std::array<std::vector<learned::Features>,2> states;int steps=0,randomized=0;
    while(!g.game_over) {
        auto x=learned::features(g,0);
        int t0=g.players[0].time_pos,t1=g.players[1].time_pos;
        if(std::max(t0,t1)<8)states[0].push_back(x);
        if(std::min(t0,t1)>=40&&std::max(t0,t1)<53)states[1].push_back(x);
        auto a=ai[g.current_player_idx].get_best_action(g,ALL_PIECES);
        if(a.type!=0&&game_rng()%5==0) {
            std::vector<Action> same;
            for(auto b:g.get_legal_actions(ALL_PIECES))if(a.type==b.type&&a.piece_id==b.piece_id&&V2RolloutPolicy::touches(g.players[g.current_player_idx].board,b.mask))same.push_back(b);
            a=same[game_rng()%same.size()];randomized++;
        }
        if(a.type!=0&&!V2RolloutPolicy::touches(g.players[g.current_player_idx].board,a.mask))throw std::runtime_error("disconnected source move");
        g.apply_action(a,ALL_PIECES);if(++steps>120)throw std::runtime_error("source game did not finish");
    }
    std::mt19937 rng(7000000+id);int selected=0;
    for(int phase=0;phase<2;phase++) {
      std::shuffle(states[phase].begin(),states[phase].end(),rng);
      bool found=false;
      for(const auto& x:states[phase]) {
        if(found)break;
        auto state=restore(x);std::array<std::vector<Action>,4> choices;
        for(auto a:state.get_legal_actions(ALL_PIECES))if(a.type!=0&&V2RolloutPolicy::touches(state.players[state.current_player_idx].board,a.mask))choices[a.type==1?a.offset+1:0].push_back(a);
        std::vector<int> available;for(int k=0;k<4;k++)if(choices[k].size()>=8)available.push_back(k);
        if(available.empty())continue;
        auto options=choices[available[rng()%available.size()]];int actor=state.current_player_idx;
        std::stable_sort(options.begin(),options.end(),[&](auto a,auto b){return V2RolloutPolicy::geometry(state.players[actor].board|a.mask,!state.bonus_claimed)>V2RolloutPolicy::geometry(state.players[actor].board|b.mask,!state.bonus_claimed);});
        std::vector<Action> picked{options[0],options[1]};std::vector<std::pair<float,Action>> ranked;
        for(auto a:options){auto next=state;next.apply_legal_action(a,ALL_PIECES);ranked.push_back({learned::value(next,actor),a});}
        std::stable_sort(ranked.begin(),ranked.end(),[](const auto& a,const auto& b){return a.first>b.first;});
        auto add=[&](Action a){if(std::none_of(picked.begin(),picked.end(),[&](Action b){return a.mask==b.mask;}))picked.push_back(a);};
        add(ranked[0].second);add(ranked[1].second);
        std::shuffle(options.begin(),options.end(),rng);for(auto a:options){if(picked.size()==8)break;add(a);}
        int group=id*2+phase;
        for(auto a:picked) {
            auto next=state;next.apply_action(a,ALL_PIECES);auto features=learned::features(next,actor);
            float margin=0,win=0;
            for(int r=0;r<16;r++){auto result=rollout(next,actor,1000000+group*31+r);margin+=result.first/16;win+=result.second/16;}
            float game_id=float(id),group_id=float(group);
            out.write(reinterpret_cast<char*>(&game_id),4);out.write(reinterpret_cast<char*>(&group_id),4);
            out.write(reinterpret_cast<char*>(features.data()),sizeof(features));
            out.write(reinterpret_cast<char*>(&margin),4);out.write(reinterpret_cast<char*>(&win),4);
        }
        selected++;found=true;
      }
    }
    log<<id<<','<<seed<<','<<steps<<','<<g.players[0].get_score()<<','<<g.players[1].get_score()<<','<<g.winner()<<','<<randomized<<','<<selected<<'\n';
}
int main(int argc,char** argv) {
    int count=argc>1?std::stoi(argv[1]):3000,workers=argc>2?std::stoi(argv[2]):4;
    std::string directory=argc>3?argv[3]:"release/.build/phase-corpus";
    if(argc>4)openingBase=std::stoul(argv[4]);
    if(count<1||count>10000||workers<1||workers>4)throw std::invalid_argument("bad corpus arguments");
    std::filesystem::create_directories(directory);
    std::vector<int> tasks(count);std::iota(tasks.begin(),tasks.end(),0);std::mt19937 schedule(20260927);std::shuffle(tasks.begin(),tasks.end(),schedule);
    auto start=std::chrono::steady_clock::now();std::vector<std::future<void>> jobs;
    for(int worker=0;worker<workers;worker++)jobs.push_back(std::async(std::launch::async,[&,worker]{
        std::string stem=directory+"/shard-"+std::to_string(worker);
        if(std::filesystem::exists(stem+".bin"))throw std::runtime_error("refusing to overwrite existing corpus shard");
        std::ofstream out(stem+".bin",std::ios::binary),log(stem+".csv");
        if(!out||!log)throw std::runtime_error("cannot open corpus shard");
        log<<"game,opening_seed,steps,p0_score,p1_score,winner,random_placements,groups\n";
        for(int i=worker;i<count;i+=workers) {
            generate_game(tasks[i],out,log);
            int done=++completed;
            if(done%200==0||done==count) {
                double seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
                std::lock_guard<std::mutex> lock(output_mutex);std::cout<<"games="<<done<<"/"<<count<<" elapsed_s="<<seconds<<'\n'<<std::flush;
            }
        }
        out.close();log.close();if(!out||!log)throw std::runtime_error("corpus write failed");
    }));
    for(auto& job:jobs)job.get();
}
