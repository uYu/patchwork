"""Complete-game records; outcome labels are committed only at terminal states."""
import hashlib,json,os
from pathlib import Path
import numpy as np
from .engine import State,ROOT
from .search import choose

def fingerprint():
    h=hashlib.sha256()
    for name in ('cpp/engine.hpp','cpp/data.hpp','src/game/patches.json'):h.update((ROOT/name).read_bytes())
    return h.hexdigest()

def action_hash(actions):return hashlib.sha256(json.dumps([a.key() for a in actions],separators=(',',':')).encode()).hexdigest()

def atomic_json(path,data):
    path=Path(path);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,indent=2)+'\n');tmp.replace(path)

def self_play(engine,search,seed,simulations=64,temperature_moves=12,on_move=None):
    rng=np.random.default_rng(seed);s=engine.initial(seed);records=[];sim_count=0;elapsed=0
    while not s.over:
        if len(records)>=256:raise RuntimeError('game failed to terminate; no truncated labels will be written')
        root,visits,metrics=search.run(s,simulations,seed=seed*1009+len(records),noise=True)
        actions=[e.action for e in root.edges];pi=visits/visits.sum()
        records.append({'state':s.to_dict(),'player':s.current,'action_hash':action_hash(actions),'visits':[[int(i),int(visits[i])] for i in np.flatnonzero(visits)],'simulations':metrics['simulations']})
        index=choose(visits,rng,1 if len(records)<=temperature_moves else 0)
        records[-1]['selected_action']=list(actions[index].key());sim_count+=metrics['simulations'];elapsed+=metrics['elapsed_ms']
        s=engine.apply(s,actions[index])
        if on_move:on_move(len(records),metrics)
    winner=engine.winner(s)
    for row in records:row['outcome']=1 if row['player']==winner else -1
    scores=[int(s.buttons[i])-2*(81-(int(s.boards[2*i])|(int(s.boards[2*i+1])<<64)).bit_count())+7*int(s.bonus[i]) for i in range(2)]
    return {'schema':'patchwork-az-game-v1','engine_sha256':fingerprint(),'contact_rule':engine.contact,'seed':seed,'winner':winner,'scores':scores,'terminal_state':s.to_dict(),'positions':records,'search_simulations':sim_count,'search_ms':elapsed}

def validate_game(data,engine):
    if data['schema']!='patchwork-az-game-v1' or data['engine_sha256']!=fingerprint() or data['contact_rule']!=engine.contact:raise ValueError('incompatible replay rules')
    s=engine.initial(data['seed'])
    for row in data['positions']:
        if row['state']!=s.to_dict() or row['player']!=s.current or row['outcome']!=(1 if row['player']==data['winner'] else -1):raise ValueError('replay state/perspective/outcome mismatch')
        actions=engine.legal(s)
        if action_hash(actions)!=row['action_hash']:raise ValueError('action ordering changed')
        indices=[i for i,n in row['visits']]
        if len(set(indices))!=len(indices) or any(not 0<=i<len(actions) or n<1 for i,n in row['visits']) or sum(n for i,n in row['visits'])!=row['simulations']:raise ValueError('invalid visit targets')
        selected=[a for a in actions if list(a.key())==row['selected_action']]
        if len(selected)!=1:raise ValueError('illegal recorded action')
        s=engine.apply(s,selected[0])
    if not s.over or engine.winner(s)!=data['winner'] or s.to_dict()!=data['terminal_state']:raise ValueError('incomplete or incorrect terminal game')
    return data

def load_games(paths,engine):return [validate_game(json.loads(Path(p).read_text()),engine) for p in paths]

def split_games(games,seed=0):
    if len(games)<2:raise ValueError('need two complete games for train/validation')
    assignment={}
    for game in games:
        # Collection persists this role so a replay game never migrates across
        # the split when the window grows or another training round begins.
        role=game.get('split')
        if role is None:
            digest=hashlib.sha256(f"{seed}:{game['seed']}".encode()).digest()
            role='validation' if int.from_bytes(digest[:8],'little')%5==0 else 'train'
        if role not in ('train','validation'):raise ValueError('invalid replay split')
        if game['seed'] in assignment and assignment[game['seed']]!=role:raise ValueError('same opening appears in both partitions')
        assignment[game['seed']]=role
    train=[g for g in games if assignment[g['seed']]=='train']
    val=[g for g in games if assignment[g['seed']]=='validation']
    if not train or not val:raise ValueError('need complete games on both sides of the persistent split')
    return train,val
