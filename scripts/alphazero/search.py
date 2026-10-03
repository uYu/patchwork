"""Full-action PUCT with values in the actual player perspective, not depth parity."""
from dataclasses import dataclass,field
import time
import numpy as np
@dataclass
class Edge:
    action:object
    prior:float
    visits:int=0
    total:float=0
    child:object=None
@dataclass
class Node:
    state:object
    edges:list=field(default_factory=list)
    expanded:bool=False

def backup(path,value,perspective):
    for parent,edge in path:
        edge.visits+=1;edge.total+=value if parent.state.current==perspective else -value

class PUCT:
    def __init__(self,engine,evaluator,cpuct=1.5):
        if cpuct<=0:raise ValueError('cpuct must be positive')
        self.engine=engine;self.evaluator=evaluator;self.cpuct=cpuct
    def expand(self,node):
        if node.state.over:return 1. if self.engine.winner(node.state)==node.state.current else -1.
        actions=self.engine.legal(node.state)
        if not actions:raise RuntimeError('nonterminal state without legal actions')
        priors,value=self.evaluator(node.state,actions)
        priors=np.asarray(priors,dtype=np.float64)
        if len(priors)!=len(actions) or not np.isfinite(priors).all() or (priors<0).any() or priors.sum()<=0 or not np.isfinite(value) or not -1<=value<=1:raise ValueError('invalid network output')
        priors=priors/priors.sum();node.edges=[Edge(a,float(p)) for a,p in zip(actions,priors)];node.expanded=True
        return value
    def run(self,s,simulations=64,seed=0,noise=False,budget_ms=None):
        if simulations<1 or s.over:raise ValueError('positive simulations and nonterminal state required')
        if budget_ms is not None and budget_ms<=0:raise ValueError('positive time budget required')
        started=time.monotonic();rng=np.random.default_rng(seed);root=Node(s);self.expand(root)
        if noise:
            # Scale alpha by branching factor; total concentration remains 10.
            epsilon=.25;dirichlet=rng.dirichlet(np.full(len(root.edges),10/len(root.edges)))
            for e,d in zip(root.edges,dirichlet):e.prior=(1-epsilon)*e.prior+epsilon*float(d)
        completed=0
        for _ in range(simulations):
            if budget_ms is not None and completed and (time.monotonic()-started)*1000>=budget_ms:break
            node=root;path=[]
            while node.expanded and not node.state.over:
                total=sum(e.visits for e in node.edges)
                scores=np.array([(e.total/e.visits if e.visits else 0)+self.cpuct*e.prior*np.sqrt(total+1)/(1+e.visits) for e in node.edges])
                maximum=scores.max();choices=np.flatnonzero(np.isclose(scores,maximum,rtol=0,atol=1e-12));edge=node.edges[int(rng.choice(choices))]
                path.append((node,edge))
                if edge.child is None:edge.child=Node(self.engine.apply(node.state,edge.action))
                node=edge.child
            value=self.expand(node);backup(path,value,node.state.current);completed+=1
        visits=np.array([e.visits for e in root.edges],dtype=np.int32)
        return root,visits,{'simulations':completed,'elapsed_ms':(time.monotonic()-started)*1000,'legal_actions':len(root.edges)}

def choose(visits,rng,temperature=1.):
    if temperature<0:raise ValueError('negative temperature')
    if temperature==0:return int(rng.choice(np.flatnonzero(visits==visits.max())))
    weights=np.exp(np.log(np.maximum(visits,1e-30))/temperature-np.log(max(visits.max(),1))/temperature)
    return int(rng.choice(len(visits),p=weights/weights.sum()))
