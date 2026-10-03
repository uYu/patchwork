"""Reproducible small self-play/train/gate loop with authoritative live JSON files."""
import argparse,copy,getpass,json,time
from pathlib import Path
import numpy as np
import torch
from .engine import Engine,ROOT
from .network import PolicyValue,Evaluator,save_model,load_model
from .search import PUCT
from .replay import atomic_json,self_play,validate_game,load_games,fingerprint
from .train import fit
from .arena import paired,summarize
from .tracking import Tracker

def parser():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--rounds',type=int,default=3)
    p.add_argument('--games',type=int,default=32);p.add_argument('--simulations',type=int,default=64)
    p.add_argument('--epochs',type=int,default=4);p.add_argument('--batch-size',type=int,default=8)
    p.add_argument('--arena-pairs',type=int,default=10);p.add_argument('--arena-simulations',type=int,default=64)
    p.add_argument('--gate-win-rate',type=float,default=.55);p.add_argument('--seed',type=int,default=20261003)
    p.add_argument('--width',type=int,default=32);p.add_argument('--blocks',type=int,default=3);p.add_argument('--hidden',type=int,default=128)
    p.add_argument('--cpuct',type=float,default=1.5);p.add_argument('--learning-rate',type=float,default=.0003)
    p.add_argument('--threads',type=int,default=1);p.add_argument('--device',choices=('cpu','mps','cuda'),default='cpu')
    p.add_argument('--contact-rule',action='store_true',help='optional old AI contact restriction; default is all game-legal actions')
    p.add_argument('--checkpoint',type=Path);p.add_argument('--replay-rounds',type=int,default=3)
    p.add_argument('--swanlab',choices=('disabled','offline','online'),default='disabled')
    p.add_argument('--project',default='patchwork-alphazero');p.add_argument('--name',default=None)
    p.add_argument('--key-prompt',action='store_true',help='read the API key without terminal echo or saving it')
    return p

def main(argv=None):
    args=parser().parse_args(argv)
    for name in ('rounds','games','simulations','epochs','batch_size','arena_pairs','arena_simulations','threads','replay_rounds'):
        if getattr(args,name)<1:raise ValueError(f'{name} must be positive')
    if args.games<2 or not .5<=args.gate_win_rate<=1 or args.seed<0 or args.cpuct<=0 or args.learning_rate<=0:raise ValueError('invalid training/gate configuration')
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    if (out/'status.json').exists():raise ValueError('refusing to overwrite an existing run')
    torch.set_num_threads(args.threads);torch.manual_seed(args.seed);np.random.seed(args.seed)
    torch.use_deterministic_algorithms(True)
    engine=Engine(contact=args.contact_rule)
    model=load_model(args.checkpoint,args.device)[0] if args.checkpoint else PolicyValue(args.width,args.blocks,args.hidden).to(args.device)
    config={k:str(v) if isinstance(v,Path) else v for k,v in vars(args).items() if k!='key_prompt'}
    config.update({'torch_version':str(torch.__version__),'numpy_version':np.__version__,'architecture':model.config,'parameters':sum(p.numel() for p in model.parameters()),'engine_sha256':fingerprint(),'algorithm':'policy-value PUCT self-play','all_legal_actions':not engine.contact,'value_target':'terminal win/loss, actual current-player perspective','replay_split':'persistent complete opening games (every fifth collected game held out)','production_changed':False})
    atomic_json(out/'config.json',config);save_model(out/'initial.pt',model,engine_sha256=fingerprint(),contact_rule=engine.contact)
    started=time.monotonic();status={'state':'initializing','round':0,'completed_games':0,'completed_positions':0,'arena':{},'arena_expected_games':2*args.arena_pairs,'parameters':config['parameters']}
    def publish(**updates):
        status.update(updates);status['elapsed_seconds']=round(time.monotonic()-started,2);atomic_json(out/'status.json',status)
    publish();tracker=None
    try:
        key=getpass.getpass('SwanLab API key (not saved): ') if args.key_prompt and args.swanlab=='online' else None
        tracker=Tracker(out,config,args.swanlab,args.project,args.name,key);del key
        tracker.source_snapshot(sorted((ROOT/'scripts/alphazero').glob('*.py'))+[ROOT/'scripts/alphazero/requirements.txt',ROOT/'scripts/run-alphazero.py',ROOT/'scripts/arena-alphazero.py',ROOT/'cpp/alphazero-engine.cpp',ROOT/'cpp/engine.hpp',ROOT/'cpp/data.hpp',ROOT/'tests/alphazero.py',ROOT/'docs/ALPHAZERO.md'],ROOT)
        tracker.log({'run/parameters':config['parameters'],'run/code_ready':1})
        reports=[];completed_paths=[]
        for iteration in range(1,args.rounds+1):
            folder=out/f'round-{iteration:03d}';folder.mkdir();game_dir=folder/'games';game_dir.mkdir()
            evaluator=Evaluator(model,args.device);search=PUCT(engine,evaluator,args.cpuct);publish(state='self_play',round=iteration,round_completed_games=0)
            new_paths=[]
            for game in range(args.games):
                seed=args.seed+(iteration-1)*args.games+game
                def move_callback(moves,metrics):publish(current_game=game,current_game_moves=moves,last_search=metrics)
                data=self_play(engine,search,seed,args.simulations,on_move=move_callback)
                data['split']='validation' if game%5==0 else 'train';validate_game(data,engine)
                path=game_dir/f'{seed}.json';atomic_json(path,data);new_paths.append(path)
                status['completed_games']+=1;status['completed_positions']+=len(data['positions']);publish(round_completed_games=game+1)
                tracker.log({'selfplay/round':iteration,'selfplay/completed_games':status['completed_games'],'selfplay/completed_positions':status['completed_positions'],'selfplay/game_moves':len(data['positions']),'selfplay/search_ms':data['search_ms'],'selfplay/simulations':data['search_simulations'],'selfplay/player0_score':data['scores'][0],'selfplay/player1_score':data['scores'][1]})
            completed_paths.append(new_paths);replay_paths=[p for part in completed_paths[-args.replay_rounds:] for p in part]
            games=load_games(replay_paths,engine);candidate=copy.deepcopy(model);publish(state='training')
            def epoch_callback(metrics):
                publish(training=metrics);tracker.log({f'train/{k}':v for k,v in metrics.items()})
            training=fit(candidate,games,engine,folder/'candidate.pt',args.epochs,args.batch_size,args.learning_rate,args.seed+iteration,args.device,epoch_callback)
            atomic_json(folder/'training.json',training);publish(state='arena',arena=summarize([]))
            new_search=PUCT(engine,Evaluator(candidate,args.device),args.cpuct);old_search=PUCT(engine,Evaluator(model,args.device),args.cpuct)
            def game_callback(rows):
                summary=summarize(rows);atomic_json(folder/'arena-games.json',rows);publish(arena=summary);tracker.log({f'arena/{k}':v for k,v in summary.items()})
            arena=paired(engine,new_search,old_search,args.arena_pairs,args.seed+1000000+iteration*10000,args.arena_simulations,on_game=game_callback)
            accepted=arena['win_rate']>=args.gate_win_rate
            if accepted:model=candidate
            save_model(folder/'incumbent.pt',model,engine_sha256=fingerprint(),contact_rule=engine.contact,iteration=iteration,accepted=accepted)
            save_model(out/'latest.pt',model,engine_sha256=fingerprint(),contact_rule=engine.contact,iteration=iteration,accepted=accepted)
            report={'iteration':iteration,'training':training,'arena':arena,'accepted':accepted,'production_promoted':False};reports.append(report);atomic_json(folder/'report.json',report)
            tracker.log({'gate/accepted':int(accepted),'gate/round':iteration});publish(last_gate=report)
        atomic_json(out/'report.json',{'schema':'patchwork-az-loop-v1','config':config,'iterations':reports,'production_promoted':False});publish(state='complete')
        tracker.finish();print(json.dumps({'state':'complete','report':str(out/'report.json'),'swanlab':str(out/'swanlab.json') if args.swanlab!='disabled' else None}),flush=True)
    except BaseException as error:
        # Do not serialize SDK exceptions: they can contain authentication/request data.
        publish(state='failed',error_type=type(error).__name__)
        if tracker:tracker.finish(failed=True)
        raise
