"""Policy-supervised adaptation of a frozen encoder's distributional value head."""
import copy
import torch

def _validate(rows,head):
    if not rows:raise ValueError('Empty split')
    ids=set()
    for r in rows:
        x,t=r['features'],r['target'];n=x.shape[0]
        if r['id'] in ids:raise ValueError('Duplicate position')
        ids.add(r['id'])
        if x.ndim!=2 or x.shape[1]!=head.in_features or n<1 or t.shape!=(n,):raise ValueError('Invalid dimensions')
        if not torch.isfinite(x).all() or not torch.isfinite(t).all() or (t<0).any() or abs(t.sum().item()-1)>1e-5:raise ValueError('Invalid numerical data')
        if not isinstance(r['best'],int) or not 0<=r['best']<n:raise ValueError('Invalid best move')
    return ids

def policy_logits(head,features,temperature=.05):
    logits=head(features)
    centers=(torch.arange(head.out_features,dtype=logits.dtype,device=logits.device)+.5)/head.out_features
    return (logits.softmax(-1)*centers).sum(-1)/temperature

def measure(head,rows):
    loss=0.;hits=0
    with torch.no_grad():
        for r in rows:
            logits=policy_logits(head,r['features']);loss+=float(-(r['target']*logits.log_softmax(0)).sum());hits+=int(logits.argmax())==r['best']
    return {'count':len(rows),'crossEntropy':loss/len(rows),'top1':hits/len(rows)}

def fit_value_head(original,train,validation,epochs=30,lr=1e-4,patience=6,on_epoch=lambda r:None):
    if not isinstance(epochs,int) or not 1<=epochs<=100 or not 0<lr<=.1 or not isinstance(patience,int) or not 1<=patience<=epochs:raise ValueError('Invalid fitting budget')
    if _validate(train,original)&_validate(validation,original):raise ValueError('Split overlap')
    head=copy.deepcopy(original);head.train();opt=torch.optim.AdamW(head.parameters(),lr=lr,weight_decay=0)
    with torch.no_grad():priors=[original(r['features']).softmax(-1).detach() for r in train]
    baseline=measure(head,validation);best=baseline;state=copy.deepcopy(head.state_dict());history=[];stale=0;selected_epoch=0
    generator=torch.Generator().manual_seed(42)
    for epoch in range(1,epochs+1):
        for ids in torch.randperm(len(train),generator=generator).split(16):
            opt.zero_grad(set_to_none=True);loss=torch.zeros((),dtype=head.weight.dtype,device=head.weight.device)
            for index in ids.tolist():
                r=train[index];raw=head(r['features']);centers=(torch.arange(head.out_features,dtype=raw.dtype,device=raw.device)+.5)/head.out_features
                logp=((raw.softmax(-1)*centers).sum(-1)/.05).log_softmax(0)
                policy=-(r['target']*logp).sum()
                anchor=torch.nn.functional.kl_div(raw.log_softmax(-1),priors[index],reduction='batchmean')
                loss=loss+policy+.05*anchor
            (loss/len(ids)).backward();torch.nn.utils.clip_grad_norm_(head.parameters(),1.0);opt.step()
        metrics=measure(head,validation)
        improved=metrics['top1']>best['top1'] or (metrics['top1']==best['top1'] and metrics['crossEntropy']<best['crossEntropy']-1e-8)
        if improved:best=metrics;state=copy.deepcopy(head.state_dict());stale=0;selected_epoch=epoch
        else:stale+=1
        row={'epoch':epoch,'validation':metrics,'selected':improved};history.append(row);on_epoch(copy.deepcopy(row))
        if stale>=patience:break
    return {'baseline':baseline,'selected':best,'selected_epoch':selected_epoch,'history':history,'state_dict':state,'settings':{'epochs':epochs,'lr':lr,'patience':patience,'temperature':.05,'bucketPriorKL':.05}}
