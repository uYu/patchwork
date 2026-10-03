#!/usr/bin/env python3
"""Time-budgeted side-swapped AlphaZero vs advanced/checkpoint screening arena."""
import argparse,json,time
from pathlib import Path
import torch
from alphazero.engine import Engine
from alphazero.network import load_model,Evaluator
from alphazero.search import PUCT
from alphazero.arena import paired,summarize,AdvancedSearch
from alphazero.replay import atomic_json,fingerprint
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('candidate',type=Path);p.add_argument('--baseline',choices=('advanced','checkpoint'),default='advanced');p.add_argument('--baseline-model',type=Path)
p.add_argument('--pairs',type=int,default=10);p.add_argument('--budget-ms',type=int,default=1000);p.add_argument('--seed',type=int,default=8100000);p.add_argument('--output',type=Path,required=True)
p.add_argument('--threads',type=int,default=1);p.add_argument('--device',default='cpu');p.add_argument('--contact-rule',action='store_true');p.add_argument('--cpuct',type=float,default=1.5)
args=p.parse_args()
if min(args.pairs,args.budget_ms,args.threads)<1:p.error('positive pairs, budget and threads required')
if args.baseline=='checkpoint' and not args.baseline_model:p.error('checkpoint baseline requires --baseline-model')
args.output.mkdir(parents=True,exist_ok=True)
if (args.output/'status.json').exists():p.error('refusing to overwrite arena')
torch.set_num_threads(args.threads);engine=Engine(contact=args.contact_rule)
model,metadata=load_model(args.candidate,args.device)
if metadata.get('engine_sha256')!=fingerprint() or metadata.get('contact_rule')!=engine.contact:p.error('checkpoint rules/contact configuration mismatch')
new=PUCT(engine,Evaluator(model,args.device),args.cpuct)
if args.baseline=='advanced':old=AdvancedSearch(engine)
else:
 baseline,meta=load_model(args.baseline_model,args.device)
 if meta.get('engine_sha256')!=fingerprint() or meta.get('contact_rule')!=engine.contact:p.error('baseline checkpoint rules mismatch')
 old=PUCT(engine,Evaluator(baseline,args.device),args.cpuct)
started=time.monotonic();status={'state':'running','expected_games':2*args.pairs,'budget_ms':args.budget_ms,'baseline':args.baseline,'contact_rule':engine.contact,'advanced_contact_rule':True,'candidate':str(args.candidate.resolve())}
def update(rows):
 atomic_json(args.output/'games.json',rows);status.update(summarize(rows));status['elapsed_seconds']=time.monotonic()-started;atomic_json(args.output/'status.json',status)
update([])
try:
 summary=paired(engine,new,old,args.pairs,args.seed,simulations=1000000000,budget_ms=args.budget_ms,on_game=update)
 status['state']='complete';atomic_json(args.output/'summary.json',summary);atomic_json(args.output/'status.json',status);print(json.dumps(summary,indent=2))
except BaseException as error:
 status.update(state='failed',error_type=type(error).__name__);atomic_json(args.output/'status.json',status);raise
