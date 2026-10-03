"""Paired side-swapped evaluation, with noise and temperature disabled."""
import numpy as np
from .search import choose

def play(engine,new,old,seed,new_side,simulations=64,budget_ms=None):
    s=engine.initial(seed);rng=np.random.default_rng(seed);steps=0;times=[0.,0.];counts=[0,0]
    while not s.over:
        if steps>=256:raise RuntimeError('arena game did not terminate')
        is_new=s.current==new_side;search=new if is_new else old
        root,visits,info=search.run(s,simulations,seed=seed*1009+steps,noise=False,budget_ms=budget_ms)
        slot=0 if is_new else 1;times[slot]+=info['elapsed_ms'];counts[slot]+=1
        s=engine.apply(s,root.edges[choose(visits,rng,0)].action);steps+=1
    scores=[int(s.buttons[i])-2*(81-(int(s.boards[2*i])|(int(s.boards[2*i+1])<<64)).bit_count())+7*int(s.bonus[i]) for i in range(2)]
    return {'seed':seed,'new_side':new_side,'new_win':engine.winner(s)==new_side,'new_score':scores[new_side],'old_score':scores[1-new_side],'new_elapsed_ms':times[0],'old_elapsed_ms':times[1],'new_turns':counts[0],'old_turns':counts[1]}

def paired(engine,new,old,pairs,seed,simulations=64,budget_ms=None,on_game=None):
    results=[]
    for i in range(pairs):
        for side in (0,1):
            results.append(play(engine,new,old,seed+i,side,simulations,budget_ms))
            if on_game:on_game(results)
    return summarize(results)

def summarize(rows):
    if not rows:return {'games':0,'wins':0,'losses':0,'win_rate':0,'mean_margin':0}
    wins=sum(r['new_win'] for r in rows)
    return {'games':len(rows),'wins':wins,'losses':len(rows)-wins,'win_rate':wins/len(rows),'mean_margin':float(np.mean([r['new_score']-r['old_score'] for r in rows])),'new_decision_ms':sum(r['new_elapsed_ms'] for r in rows)/sum(r['new_turns'] for r in rows),'old_decision_ms':sum(r['old_elapsed_ms'] for r in rows)/sum(r['old_turns'] for r in rows)}

class AdvancedSearch:
    def __init__(self,engine):self.engine=engine
    def run(self,s,simulations=64,seed=0,noise=False,budget_ms=None):
        from .search import Node,Edge
        if noise:raise ValueError('advanced baseline is evaluation-only')
        a,info=self.engine.advanced(s,budget_ms or 1000,seed)
        return Node(s,[Edge(a,1,1)]),np.array([1],dtype=np.int32),info
