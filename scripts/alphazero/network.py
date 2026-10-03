"""Small residual policy/value network; one trunk evaluation scores all legal actions."""
import torch
from torch import nn

class Residual(nn.Module):
    def __init__(self,width):
        super().__init__();self.body=nn.Sequential(nn.Conv2d(width,width,3,padding=1,bias=False),nn.GroupNorm(4,width),nn.ReLU(),nn.Conv2d(width,width,3,padding=1,bias=False),nn.GroupNorm(4,width))
    def forward(self,x):return torch.relu(x+self.body(x))

class PolicyValue(nn.Module):
    def __init__(self,width=32,blocks=3,hidden=128):
        super().__init__()
        if width%4 or width<4 or blocks<1 or hidden<4:raise ValueError('invalid architecture')
        self.config={'width':width,'blocks':blocks,'hidden':hidden}
        self.board=nn.Sequential(nn.Conv2d(2,width,3,padding=1),nn.ReLU(),*[Residual(width) for _ in range(blocks)])
        self.patch=nn.Sequential(nn.Linear(89,32),nn.ReLU())
        layer=nn.TransformerEncoderLayer(32,4,64,dropout=0,batch_first=True,norm_first=False)
        self.market=nn.TransformerEncoder(layer,1,enable_nested_tensor=False)
        self.state=nn.Sequential(nn.Linear(width*81+128+19,hidden),nn.ReLU())
        self.shape=nn.Sequential(nn.Linear(85,16),nn.ReLU())
        self.policy=nn.Sequential(nn.Linear(hidden+2*width+16+11,64),nn.ReLU(),nn.Linear(64,1))
        self.value=nn.Sequential(nn.Linear(hidden,64),nn.ReLU(),nn.Linear(64,1),nn.Tanh())
    def forward(self,batch):
        fmap=self.board(batch['boards']);mask=batch['present'];safe=mask.clone();safe[:,0]=True
        market=self.market(self.patch(batch['market']),src_key_padding_mask=~safe)*mask[:,:,None]
        summary=market.sum(1)/mask.sum(1,keepdim=True).clamp_min(1)
        g=self.state(torch.cat((fmap.flatten(1),market[:,:3].flatten(1),summary,batch['scalars']),1))
        index=batch['state_index'];masks=batch['masks'];features=fmap.flatten(2)[index]
        pool=torch.einsum('anc,akc->ank',masks,features)/masks.sum(2,keepdim=True).clamp_min(1)
        policy=self.policy(torch.cat((g[index],pool.flatten(1),self.shape(batch['shapes']),batch['meta']),1)).squeeze(1)
        return policy,self.value(g).squeeze(1)

def collate(examples,device='cpu'):
    import numpy as np
    batch={k:torch.as_tensor(np.stack([x[k] for x in examples]),device=device) for k in ('boards','scalars','market','present')}
    for k in ('masks','shapes','meta'):batch[k]=torch.as_tensor(np.concatenate([x[k] for x in examples]),device=device)
    counts=[len(x['meta']) for x in examples]
    batch['state_index']=torch.repeat_interleave(torch.arange(len(examples),device=device),torch.tensor(counts,device=device))
    batch['counts']=counts
    return batch

class Evaluator:
    def __init__(self,model,device='cpu'):
        self.model=model.to(device).eval();self.device=device;self.calls=0;self.actions=0
    @torch.inference_mode()
    def __call__(self,s,actions):
        from .features import encode
        logits,value=self.model(collate([encode(s,actions)],self.device));self.calls+=1;self.actions+=len(actions)
        return torch.softmax(logits,0).cpu().numpy(),float(value[0])

def save_model(path,model,**metadata):
    from pathlib import Path
    path=Path(path);temporary=path.with_suffix('.tmp')
    torch.save({'schema':'patchwork-az-v1','architecture':model.config,'state_dict':model.state_dict(),**metadata},temporary);temporary.replace(path)

def load_model(path,device='cpu'):
    data=torch.load(path,map_location=device,weights_only=True)
    if data['schema']!='patchwork-az-v1':raise ValueError('unsupported checkpoint')
    model=PolicyValue(**data['architecture']);model.load_state_dict(data['state_dict']);return model.to(device),data
