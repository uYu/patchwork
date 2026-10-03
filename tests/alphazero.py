"""Rules, perspective, masking, augmentation, training and checkpoint regressions."""
from pathlib import Path
import sys,tempfile,copy
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import numpy as np
import torch
from alphazero.engine import Engine,State,Action
from alphazero.features import encode,transform
from alphazero.network import PolicyValue,Evaluator,collate,save_model,load_model
from alphazero.search import PUCT,Node,Edge,backup,choose
from alphazero.replay import self_play,validate_game,split_games
from alphazero.train import loss_terms

torch.set_num_threads(1);torch.manual_seed(7);engine=Engine();s=engine.initial(7);actions=engine.legal(s)
assert len(actions)>100 and any(a.type==0 for a in actions)
# Invalid actions are rejected rather than applied silently.
bad=Action();bad.type=1;bad.piece=32
try:engine.apply(s,bad);raise AssertionError('invalid action accepted')
except ValueError:pass
# Terminal ties obey first-finished rather than becoming draws.
t=s.clone();t.over=1;t.time[:]=[53,53];t.firstFinished=1
assert engine.winner(t)==1
# Leather placement and time ordering can both retain the same player.
t=s.clone();t.time[:]=[10,20];t.pending=2
u=engine.apply(t,engine.legal(t)[0]);assert u.current==0 and u.pending==1
v=engine.apply(u,engine.legal(u)[0]);assert v.current==0 and v.pending==0
# Value sign follows player identity, never alternating depth.
path=[]
for player in (0,0,1):
 t=s.clone();t.current=player;path.append((Node(t),Edge(actions[0],1)))
backup(path,1,1);assert [e.total for n,e in path]==[-1,-1,1]
# All legal actions are retained; every simulation contributes one root visit.
def uniform(s,actions):return np.ones(len(actions))/len(actions),.25
root,visits,info=PUCT(engine,uniform).run(s,8,seed=7,noise=True)
assert len(root.edges)==len(actions) and visits.sum()==8 and info['simulations']==8
assert np.isclose(sum(e.prior for e in root.edges),1)
# D4 preserves legality, including the complete action-mask mapping.
for _ in range(6):s=engine.apply(s,engine.legal(s)[-1])
actions=engine.legal(s)
for symmetry in range(8):
 t=s.clone()
 for player in range(2):
  mask=int(s.boards[2*player])|(int(s.boards[2*player+1])<<64)
  grid=np.array([(mask>>i)&1 for i in range(81)]).reshape(9,9);rot=transform(grid,symmetry)
  bits=sum(int(v)<<i for i,v in enumerate(rot.ravel()));t.boards[2*player]=bits&((1<<64)-1);t.boards[2*player+1]=bits>>64
 legal={(a.type,a.piece,a.mask) for a in engine.legal(t)};x=encode(s,actions,symmetry)
 for i,a in enumerate(actions):
  mask=sum(int(v)<<j for j,v in enumerate(x['masks'][i,0]))
  assert (a.type,a.piece,mask) in legal
# Empty market is finite; evaluation is invariant to batch companions.
model=PolicyValue(8,1,16).eval();a=engine.legal(s);x=encode(s,a)
t=s.clone();t.size=0;t.token=0;empty=encode(t,engine.legal(t))
with torch.no_grad():
 logits,value=model(collate([x]));both,v=model(collate([x,empty]));assert torch.isfinite(both).all() and torch.isfinite(v).all()
 torch.testing.assert_close(logits,both[:len(a)],atol=1e-6,rtol=1e-5);torch.testing.assert_close(value,v[:1],atol=1e-6,rtol=1e-5)
# Both heads receive finite gradients and a supervised update reduces this loss.
model.train();batch=collate([x]);pi=torch.zeros(len(a));pi[0]=1;target=torch.tensor([1.]);optimizer=torch.optim.Adam(model.parameters(),lr=.001)
initial=None
for i in range(5):
 optimizer.zero_grad();logits,value=model(batch);loss,_=loss_terms(logits,value,batch,[pi],target)
 if initial is None:initial=float(loss.detach())
 loss.backward()
 assert all(p.grad is not None and torch.isfinite(p.grad).all() for p in model.parameters())
 optimizer.step()
assert float(loss.detach())<initial
with tempfile.TemporaryDirectory() as folder:
 path=Path(folder)/'model.pt';save_model(path,model);loaded,_=load_model(path);loaded.eval();model.eval()
 with torch.no_grad():
  for a,b in zip(model(batch),loaded(batch)):torch.testing.assert_close(a,b)
# Complete-game labels, reconstruction and game-level train/validation split.
games=[self_play(engine,PUCT(engine,uniform),seed,2) for seed in (41,42)]
for i,game in enumerate(games):
 game['split']='train' if i else 'validation';validate_game(game,engine)
train,val=split_games(games);assert {g['seed'] for g in train}.isdisjoint({g['seed'] for g in val})
broken=copy.deepcopy(games[0]);broken['positions'][0]['outcome']*=-1
try:validate_game(broken,engine);raise AssertionError('incorrect labels accepted')
except ValueError:pass
print('AlphaZero rules, all-action PUCT, continuous-turn backup, D4 mapping, empty-token mask, gradients, checkpoint and complete-game replay checks passed.')

# Existing games retain their partition when a replay window grows or seed changes.
more=copy.deepcopy(games);more[0]['seed']=43;more[1]['seed']=44
train2,val2=split_games(games+more,seed=99)
assert {g['seed'] for g in train}.issubset({g['seed'] for g in train2})
assert {g['seed'] for g in val}.issubset({g['seed'] for g in val2})
print('Persistent opening-game split across replay rounds passed.')
