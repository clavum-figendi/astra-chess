"""Bounded development-only, partial-label policy repair. No final holdouts."""
import torch

def policy_target(legal,best,teacher):
    target=torch.zeros(len(legal))
    ranks=torch.tensor([m['rank'] for m in teacher],dtype=torch.float32)
    probs=.25*torch.softmax(1-ranks,dim=0)
    for m,p in zip(teacher,probs):target[legal.index(m['move'])]+=p
    target[legal.index(best)]+=.75
    return target

def fold_rank_one(weight,direction,vector,max_norm):
    norm=torch.linalg.vector_norm(direction)*torch.linalg.vector_norm(vector)
    scale=torch.clamp(torch.as_tensor(max_norm)/norm.clamp_min(1e-12),max=1.)
    return weight+torch.outer(direction,vector*scale)

def contrastive_loss(scores,target,best,temperature=1.,margin=.2):
    ce=-(target*torch.log_softmax(scores/temperature,dim=0)).sum()
    if len(scores)<2:return ce
    mask=torch.arange(len(scores))!=best
    hard=scores[mask].max()
    return ce+.5*torch.nn.functional.relu(margin+hard-scores[best])/temperature
