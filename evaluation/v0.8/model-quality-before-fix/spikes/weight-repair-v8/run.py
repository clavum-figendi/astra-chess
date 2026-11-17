"""Run only v5 depth10 development data; bounded 12-epoch candidates, no selection."""
import sys,json,hashlib,time,copy
from pathlib import Path
import torch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from v8_select import require_unfrozen
sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted,save_converted,expected_values
from repair import policy_target,contrastive_loss,fold_rank_one
OUT=ROOT/'evaluation/v0.8';CACHE=ROOT/'.cache/v8'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,obj):Path(p).write_text(json.dumps(obj,indent=2)+'\n')
def metrics(rows,score_fn,temperature):
    hits=0;ce=0.;loss=0.;pred=[]
    with torch.no_grad():
        for row in rows:
            scores=score_fn(row);i=int(scores.argmax());hits+=i==row['best'];pred.append(row['legal'][i])
            ce+=float(-(row['target']*torch.log_softmax(scores/temperature,0)).sum())
            loss+=float(contrastive_loss(scores,row['target'],row['best'],temperature,.01 if temperature<1 else 1.))
    return {'count':len(rows),'bestmoveCorrect':hits,'top1':hits/len(rows),'crossEntropy':ce/len(rows),'contrastiveLoss':loss/len(rows),'predictions':pred}
def compact(m):return {k:v for k,v in m.items() if k!='predictions'}
def prep(raw,features):
    return {**raw,'x':features,'target':policy_target(raw['legal'],raw['bestmove'],raw['teacher']),'best':raw['legal'].index(raw['bestmove'])}
def wrong_sparse(rows,groups,limit=12):
    failures=[]
    for r in rows:
        scores=r['fixed']+r['x'].sum(1);i=int(scores.argmax());b=r['best']
        if i==b:continue
        diff=r['x'][i]-r['x'][b]
        order=torch.argsort(diff.abs(),descending=True)[:12]
        failures.append({'id':r['id'],'fen':r['fen'],'wrong':r['legal'][i],'teacherBest':r['bestmove'],'scoreGap':float(scores[i]-scores[b]),'protectedFixedGap':float(r['fixed'][i]-r['fixed'][b]),'groupGapContributions':[{'group':groups[j]['key'],'enemyMaterial':groups[j]['enemy'],'value':float(diff[j])} for j in order.tolist() if diff[j]!=0]})
    failures.sort(key=lambda x:-x['scoreGap'])
    return {'wrongTrainingCount':len(failures),'examples':failures[:limit]}
def sparse(family):
    require_unfrozen(CACHE)
    path=CACHE/f'weight-{family}-features.json';cache=json.loads(path.read_text());groups=cache['groups'];G=len(groups);splits={}
    for split,raws in cache['splits'].items():
        assert sha(ROOT/f'.cache/deepmind-v5/{split}.json')==cache['datasetSHA256'][split]
        rows=[]
        for raw in raws:
            x=torch.zeros(len(raw['moves']),G);fixed=torch.tensor([m['fixed'] for m in raw['moves']])
            for i,m in enumerate(raw['moves']):x[i,m['indices']]=torch.tensor(m['values'],dtype=torch.float32)
            rows.append({**prep(raw,x),'fixed':fixed})
        splits[split]=rows
    baseline={s:metrics(rows,lambda r:r['fixed']+r['x'].sum(1),4.) for s,rows in splits.items()}
    diagnosis=wrong_sparse(splits['train'],groups)
    candidates=[{'id':'control','scales':[1.]*G,'epoch':0,'metrics':{s:compact(m) for s,m in baseline.items()},'status':'control'}]
    for relax in [False,True]:
        scales=torch.nn.Parameter(torch.ones(G));opt=torch.optim.Adam([scales],lr=.015)
        lower=torch.tensor([g['lower'] if relax or not g['enemy'] else 1. for g in groups]);upper=torch.tensor([g['upper'] if relax or not g['enemy'] else 1. for g in groups]);history=[]
        for epoch in range(1,13):
            for start in range(0,len(splits['train']),16):
                batch=splits['train'][start:start+16];opt.zero_grad();loss=0.
                for r in batch:loss+=contrastive_loss(r['fixed']+r['x']@scales,r['target'],r['best'],4.,1.)
                loss=loss/len(batch)+.1*((scales-1)**2).mean();loss.backward();opt.step()
                with torch.no_grad():scales.copy_(torch.maximum(lower,torch.minimum(upper,scales)))
            history.append({'epoch':epoch,'validation':compact(metrics(splits['validation'],lambda r:r['fixed']+r['x']@scales,4.))})
        met={s:metrics(rows,lambda r:r['fixed']+r['x']@scales,4.) for s,rows in splits.items()}
        candidate={'id':'enemy-relaxed' if relax else 'enemy-protected','scales':scales.detach().tolist(),'epoch':12,'history':history,'metrics':{s:compact(m) for s,m in met.items()},'changedGroups':int((scales.detach()!=1).sum()),'freeGroups':int((lower!=upper).sum()),'settings':{'epochs':12,'lr':.015,'temperature':4.,'margin':1.,'regularization':.1,'enemyRelaxed':relax,'nonEnemyBounds':[.8,1.2],'enemyBounds':[.5,1.5]},'developmentPredictionChanges':sum(a!=b for a,b in zip(met['validation']['predictions'],baseline['validation']['predictions'])),'status':'candidate-not-selected' if met['validation']['bestmoveCorrect']>=baseline['validation']['bestmoveCorrect'] else 'development-reject'}
        candidates.append(candidate);print(json.dumps({'family':family,'candidate':candidate['id'],'metrics':candidate['metrics']}),flush=True)
    report={'family':family,'objective':'full-legal partial-rank policy CE + hardest legal negative hinge; unranked target mass zero','featureCacheSHA256':sha(path),'baseSHA256':cache['baseSHA256'],'datasetSHA256':cache['datasetSHA256'],'sourceHashes':{str(Path(__file__).relative_to(ROOT)):sha(__file__),'spikes/weight-repair-v8/repair.py':sha(Path(__file__).with_name('repair.py'))},'groups':groups,'diagnosis':diagnosis,'candidates':candidates,'newV8ValidationOrTestRead':False,'selection':'No epoch/candidate selected; fixed epoch12 and controls handed off'}
    write(CACHE/f'weight-{family}-fit.json',report);write(OUT/f'weight-{family}-development.json',report)

def deepmind():
    require_unfrozen(CACHE)
    p=ROOT/'.cache/v7/deepmind-selected.pt';assert sha(p)=='d4d5b25a4f2a01e22ea8945e42e37559e0ce0525177290d49f002c94bda761ea'
    model,meta=load_converted(p);original,_=load_converted(ROOT/'.cache/research/deepmind-9m-action-value.pt')
    assert all(torch.equal(v,original.state_dict()[k]) for k,v in model.state_dict().items() if not k.startswith('head.'))
    del original
    receipt=json.loads((ROOT/'evaluation/v0.5/adaptation.json').read_text());identity=hashlib.sha256(json.dumps(receipt['featureIdentity'],sort_keys=True).encode()).hexdigest();splits={}
    for split in ['train','validation']:
        data=ROOT/f'.cache/deepmind-v5/{split}.json';assert sha(data)==receipt['datasetSHA256'][split];rows=[]
        for raw in json.loads(data.read_text()):
            entry=torch.load(ROOT/f'.cache/deepmind-v5/features/{split}/{raw["id"]}.pt',weights_only=True)
            assert entry['identity']==identity and entry['legal']==raw['legal']
            row=prep(raw,entry['features'].float());row['logits']=model.head(row['x']).detach();rows.append(row)
        splits[split]=rows
    baseline={s:metrics(rows,lambda r:expected_values(r['logits']),.05) for s,rows in splits.items()}
    w=model.head.weight.detach().clone();bias=model.head.bias.detach().clone();direction=torch.linspace(-1,1,128);direction/=direction.norm()
    failures=[]
    for r in splits['train']:
        values=expected_values(r['logits']);i=int(values.argmax());b=r['best']
        if i==b:continue
        failures.append((float(values[i]-values[b]),r,i,b))
    failures.sort(key=lambda v:-v[0]);diagnosis=[]
    for gap,r,i,b in failures[:10]:
        delta=r['x'][i]-r['x'][b];grad=torch.zeros(256)
        for alpha in torch.linspace(0,1,33):
            x=(r['x'][b]+alpha*delta).detach().requires_grad_();ev=expected_values(torch.nn.functional.linear(x,w,bias));g=torch.autograd.grad(ev,x)[0];grad+=g*(.5 if alpha in (0,1) else 1.)/32
        contrib=delta*grad;order=contrib.abs().argsort(descending=True)[:10]
        centers=(torch.arange(128)+.5)/128;bucket=centers*(torch.softmax(r['logits'][i],0)-torch.softmax(r['logits'][b],0));bo=bucket.abs().argsort(descending=True)[:8]
        diagnosis.append({'id':r['id'],'fen':r['fen'],'wrong':r['legal'][i],'teacherBest':r['bestmove'],'expectedReturnGap':gap,'featureAttribution':'Integrated gradient along best-to-wrong normalized-feature segment; descriptive sensitivity, no semantic neuron claim','completenessResidual':gap-float(contrib.sum()),'featureContributions':[{'index':j,'value':float(contrib[j])} for j in order.tolist()],'exactBucketContributions':[{'bucket':j,'value':float(bucket[j])} for j in bo.tolist()]})
    candidates=[{'id':'control','file':str(p.relative_to(ROOT)),'sha256':sha(p),'metrics':{s:compact(m) for s,m in baseline.items()},'changedScalars':0,'status':'control'}]
    for bound in [.5]:
        vector=torch.nn.Parameter(torch.zeros(256));opt=torch.optim.Adam([vector],lr=.002);history=[]
        for epoch in range(1,13):
            for start in range(0,len(splits['train']),16):
                opt.zero_grad();loss=0.;batch=splits['train'][start:start+16]
                for r in batch:
                    logits=r['logits']+(r['x']@vector)[:,None]*direction[None,:]
                    loss+=contrastive_loss(expected_values(logits),r['target'],r['best'],.05,.01)
                loss=loss/len(batch)+.01*(vector**2).sum();loss.backward();opt.step()
                with torch.no_grad():vector.mul_(min(1.,bound/max(float(vector.norm()),1e-12)))
            history.append({'epoch':epoch,'validation':compact(metrics(splits['validation'],lambda r:expected_values(r['logits']+(r['x']@vector)[:,None]*direction[None,:]),.05))})
        folded=fold_rank_one(w,direction,vector.detach(),bound)
        with torch.no_grad():model.head.weight.copy_(folded)
        file=CACHE/f'weight-deepmind-rank1-{bound}.pt';metadata={**meta,'modifications':'v8 bounded rank-one contrastive terminal head repair folded into existing 128x256 matrix','v8WeightRepair':{'bound':bound,'epochs':12,'encoderFrozen':True,'baseSHA256':sha(p)}};save_converted(model,file,metadata)
        reloaded,_=load_converted(file);assert all(torch.equal(v,reloaded.state_dict()[k]) for k,v in model.state_dict().items());assert torch.equal(model.head.bias,bias)
        met={s:metrics(rows,lambda r:expected_values(torch.nn.functional.linear(r['x'],folded,bias)),.05) for s,rows in splits.items()}
        max_error=max(float((torch.nn.functional.linear(r['x'],folded,bias)-(r['logits']+(r['x']@vector.detach())[:,None]*direction[None,:])).abs().max()) for r in splits['validation'])
        candidate={'id':f'rank1-{bound}','file':str(file.relative_to(ROOT)),'sha256':sha(file),'headFile':str((CACHE/f'weight-deepmind-rank1-{bound}-head.pt').relative_to(ROOT)),'metrics':{s:compact(m) for s,m in met.items()},'settings':{'epochs':12,'lr':.002,'maxDeltaFrobeniusNorm':bound,'rank':1,'fixedBinDirection':'normalized centered linear bucket direction','temperature':.05,'margin':.01,'regularization':.01},'history':history,'changedScalars':int((folded!=w).sum()),'parameterCount':sum(p.numel() for p in model.parameters()),'deltaFrobeniusNorm':float((folded-w).norm()),'maxFoldedLogitError':max_error,'roundtripAllTensorsEqual':True,'encoderBitwiseOriginal':True,'biasUnchanged':True,'developmentPredictionChanges':sum(a!=b for a,b in zip(met['validation']['predictions'],baseline['validation']['predictions'])),'status':'candidate-not-selected' if met['validation']['bestmoveCorrect']>=baseline['validation']['bestmoveCorrect'] else 'development-reject'}
        torch.save({k:v.detach().clone() for k,v in model.head.state_dict().items()},ROOT/candidate['headFile']);candidates.append(candidate)
        print(json.dumps({'family':'deepmind','candidate':candidate['id'],'metrics':candidate['metrics']}),flush=True)
    report={'family':'deepmind','baseSHA256':sha(p),'originalCheckpointSHA256':sha(ROOT/'.cache/research/deepmind-9m-action-value.pt'),'encoderBitwiseOriginal':True,'datasetSHA256':receipt['datasetSHA256'],'featureIdentity':identity,'sourceHashes':{str(Path(__file__).relative_to(ROOT)):sha(__file__),'spikes/weight-repair-v8/repair.py':sha(Path(__file__).with_name('repair.py'))},'diagnosis':{'wrongTrainingCount':len(failures),'examples':diagnosis},'candidates':candidates,'newV8ValidationOrTestRead':False,'selection':'None; fixed epoch12 proposals and current control'}
    write(OUT/'weight-deepmind-development.json',report)

if __name__=='__main__':
    require_unfrozen(CACHE)
    torch.set_num_threads(1);torch.set_num_interop_threads(1);torch.manual_seed(42);OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
    start=time.monotonic()
    deepmind()
    for family in ['pocket','atlas']:sparse(family)
    print(json.dumps({'durationSeconds':time.monotonic()-start}),flush=True)
