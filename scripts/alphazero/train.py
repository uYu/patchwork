"""Policy visit-distribution cross entropy plus terminal-outcome value regression."""
import numpy as np
import torch
from .engine import State
from .features import encode
from .network import collate,save_model
from .replay import split_games,fingerprint

def make_batch(rows,engine,rng=None,device='cpu'):
    examples=[];targets=[];outcomes=[]
    for row in rows:
        s=State.from_dict(row['state']);actions=engine.legal(s);examples.append(encode(s,actions,int(rng.integers(8)) if rng is not None else 0))
        pi=np.zeros(len(actions),dtype=np.float32)
        for i,n in row['visits']:pi[i]=n
        pi/=pi.sum();targets.append(torch.as_tensor(pi,device=device));outcomes.append(row['outcome'])
    return collate(examples,device),targets,torch.tensor(outcomes,dtype=torch.float32,device=device)

def loss_terms(logits,values,batch,targets,outcomes):
    chunks=torch.split(logits,batch['counts']);ce=torch.stack([-(pi*torch.log_softmax(chunk,0)).sum() for pi,chunk in zip(targets,chunks)]).mean()
    value=torch.nn.functional.mse_loss(values,outcomes)
    entropy=torch.stack([-(torch.softmax(c,0)*torch.log_softmax(c,0)).sum() for c in chunks]).mean()
    top4=torch.stack([pi[torch.topk(c,min(4,len(c))).indices].sum() for pi,c in zip(targets,chunks)]).mean()
    return ce+value,{'policy_ce':ce,'value_mse':value,'entropy':entropy,'top4_visit_mass':top4}

def evaluate(model,rows,engine,batch_size,device):
    model.eval();totals={};count=0
    with torch.inference_mode():
        for i in range(0,len(rows),batch_size):
            selected=rows[i:i+batch_size];batch,targets,outcomes=make_batch(selected,engine,device=device)
            logits,values=model(batch);loss,metrics=loss_terms(logits,values,batch,targets,outcomes);metrics['loss']=loss
            for key,value in metrics.items():totals[key]=totals.get(key,0)+float(value)*len(selected)
            count+=len(selected)
    return {k:v/count for k,v in totals.items()}

def fit(model,games,engine,output,epochs=4,batch_size=8,lr=.0003,seed=0,device='cpu',logger=None):
    train_games,val_games=split_games(games,seed);train=[r for g in train_games for r in g['positions']];val=[r for g in val_games for r in g['positions']]
    optimizer=torch.optim.AdamW(model.parameters(),lr=lr,weight_decay=1e-4);rng=np.random.default_rng(seed);model.to(device)
    best=float('inf');best_epoch=0;history=[];best_weights=None
    for epoch in range(1,epochs+1):
        model.train();order=rng.permutation(len(train));total=0;steps=0
        for i in range(0,len(order),batch_size):
            rows=[train[j] for j in order[i:i+batch_size]];batch,targets,outcomes=make_batch(rows,engine,rng,device)
            optimizer.zero_grad(set_to_none=True);logits,values=model(batch);loss,metrics=loss_terms(logits,values,batch,targets,outcomes)
            if not torch.isfinite(loss):raise FloatingPointError('nonfinite training loss')
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),5);optimizer.step();total+=float(loss.detach())*len(rows);steps+=len(rows)
        validation=evaluate(model,val,engine,batch_size,device);row={'epoch':epoch,'train_loss':total/steps,**validation};history.append(row)
        if validation['loss']<best:
            best=validation['loss'];best_epoch=epoch;best_weights={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
            save_model(output,model,training_seed=seed,best_epoch=epoch,validation=validation,engine_sha256=fingerprint(),contact_rule=engine.contact)
        if logger:logger(row)
    model.load_state_dict(best_weights);model.eval()
    return {'history':history,'best_epoch':best_epoch,'train_games':[g['seed'] for g in train_games],'validation_games':[g['seed'] for g in val_games],'train_positions':len(train),'validation_positions':len(val)}
