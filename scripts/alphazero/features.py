"""Real shapes, relative market order and spatial legal-action features; no ID channels."""
import json
import numpy as np
from .engine import ROOT
PATCHES=json.loads((ROOT/'src/game/patches.json').read_text())

def canonical(cells):
    variants=[]
    for flip in (1,-1):
        form=[(flip*x,y) for x,y in cells]
        for _ in range(4):
            mx=min(x for x,y in form);my=min(y for x,y in form)
            variants.append(sum(1<<((y-my)*9+x-mx) for x,y in form));form=[(-y,x) for x,y in form]
    return min(variants)

def bits(mask):return np.array([(mask>>i)&1 for i in range(81)],dtype=np.float32).reshape(9,9)
def attrs(piece):return np.array([piece['cost']/10,piece['time']/6,piece['income']/3,len(piece['cells'])/9],dtype=np.float32)
DESCRIPTORS=np.stack([np.concatenate((bits(canonical(p['cells'])).ravel(),attrs(p))) for p in PATCHES])

def transform(grid,symmetry):return np.rot90(grid[:,::-1] if symmetry//4 else grid,symmetry%4).copy()

def encode(s,actions,symmetry=0):
    me=s.current;players=(me,1-me)
    boards=np.stack([transform(bits(int(s.boards[2*i])|(int(s.boards[2*i+1])<<64)),symmetry) for i in players])
    scalars=[]
    for i in players:scalars.extend((s.buttons[i]/100,s.income[i]/30,s.time[i]/53,s.bonus[i]))
    scalars.extend((1,s.pending>0,s.pending/5,s.firstFinished==me,s.firstFinished==1-me,s.bonusOwner>=0))
    scalars.extend((s.claimed>>i)&1 for i in range(5))
    market=np.zeros((33,89),dtype=np.float32);present=np.zeros(33,dtype=bool);positions={}
    for rank in range(s.size):
        id=s.circle[(s.token+rank)%s.size];positions[id]=rank;market[rank,:85]=DESCRIPTORS[id]
        market[rank,85:]=[rank/32,1/(rank+1),s.size/33,rank<3];present[rank]=True
    masks=np.zeros((len(actions),2,81),dtype=np.float32);shapes=np.zeros((len(actions),85),dtype=np.float32);meta=np.zeros((len(actions),11),dtype=np.float32)
    for i,a in enumerate(actions):
        meta[i,a.type]=1
        if a.type==0:
            meta[i,10]=(min(53,s.time[1-me]+1)-s.time[me])/53;continue
        mask=transform(bits(a.mask),symmetry);masks[i,0]=mask.ravel()
        padded=np.pad(mask,1);neighbor=(padded[1:-1,:-2]+padded[1:-1,2:]+padded[:-2,1:-1]+padded[2:,1:-1])>0
        masks[i,1]=(neighbor&~mask.astype(bool)).ravel()
        yy,xx=np.nonzero(mask);xmin,ymin=xx.min(),yy.min();local=np.zeros((9,9),dtype=np.float32);local[yy-ymin,xx-xmin]=1
        properties=attrs(PATCHES[a.piece]) if a.type==1 else np.array([0,0,0,1/9],dtype=np.float32)
        shapes[i,:81]=local.ravel();shapes[i,81:]=properties
        meta[i,3]=positions[a.piece]/2 if a.type==1 else 0;meta[i,4:6]=[xmin/8,ymin/8];meta[i,6:10]=properties
    return {'boards':boards,'scalars':np.array(scalars,dtype=np.float32),'market':market,'present':present,'masks':masks,'shapes':shapes,'meta':meta}
