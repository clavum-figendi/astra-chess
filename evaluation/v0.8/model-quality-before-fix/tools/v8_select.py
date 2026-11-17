"""V8 selection: new validation only; controls win equal-hit ties."""
import hashlib, json, math, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def require_unfrozen(folder):
    if any((Path(folder)/name).exists() for name in ['selection.json','test-exposed.json']):
        raise RuntimeError('V8 selection frozen or final test exposed')
def choose_candidate(results):
    if not results or sum(r['id']=='control' for r in results)!=1:raise ValueError('Expected exactly one control')
    return min(results,key=lambda r:(-r['hits'],r['id']!='control',r['crossEntropy'],r['changedScalars'],r['id']))
def policy_metrics(scores,row,temperature):
    legal=row['legal']
    if len(scores)!=len(legal) or not legal or any(not math.isfinite(v) for v in scores):raise ValueError('Invalid legal scores')
    if len(set(legal))!=len(legal) or temperature<=0:raise ValueError('Invalid legal actions/temperature')
    targets={m:0. for m in legal};targets[row['bestmove']]=.75
    teacher=row['teacher'];denom=sum(math.exp(1-m['rank']) for m in teacher)
    for m in teacher:targets[m['move']]+=.25*math.exp(1-m['rank'])/denom
    z=[v/temperature for v in scores];peak=max(z);logsum=peak+math.log(sum(math.exp(v-peak) for v in z))
    chosen=min(range(len(legal)),key=lambda i:(-scores[i],legal[i]))
    return {'move':legal[chosen],'hit':legal[chosen]==row['bestmove'],'top4':any(legal[chosen]==m['move'] for m in teacher),'crossEntropy':sum(targets[m]*(logsum-z[i]) for i,m in enumerate(legal))}

def main():
    import torch
    sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
    from action_value import load_converted,encode_state_actions,expected_values
    torch.set_num_threads(1)
    folder=ROOT/'.cache/v8';out=ROOT/'evaluation/v0.8';require_unfrozen(folder)
    protocol=json.loads((out/'data-protocol.json').read_text());assert protocol.get('finishedAt')
    data=folder/'validation.json';assert sha(data)==protocol['splitSHA256']['validation'];rows=json.loads(data.read_text())
    manifest_path=out/'weight-manifest.json';manifest=json.loads(manifest_path.read_text())
    assert set(manifest['families'])=={'deepmind','pocket','atlas'}
    for family,candidates in manifest['families'].items():
        for c in candidates:assert sha(ROOT/c['file'])==c['sha256'],c['file']
    results={};base_record=next(c for c in manifest['families']['deepmind'] if c['id']=='control')
    model,_=load_converted(ROOT/base_record['file']);features=[]
    for index,row in enumerate(rows):
        legal=row['legal']
        with torch.no_grad():features.append(torch.cat([model.forward_features(encode_state_actions(row['fen'],legal[i:i+8])) for i in range(0,len(legal),8)]))
        if (index+1)%20==0:print('Fresh validation features',index+1,flush=True)
    for family,candidates in manifest['families'].items():
        results[family]=[]
        for candidate in candidates:
            if family=='deepmind':
                other,_=load_converted(ROOT/candidate['file'])
                assert all(torch.equal(v,other.state_dict()[k]) for k,v in model.state_dict().items() if not k.startswith('head.'))
                with torch.no_grad():scores=[torch.cat([expected_values(other.head(batch)) for batch in x.split(8)]).tolist() for x in features]
                del other
            else:
                request={'model':candidate,'rows':rows}
                scores=json.loads(subprocess.check_output(['node','tools/v8-score-sparse.mjs'],input=json.dumps(request),text=True,cwd=ROOT))
            answers=[{'id':row['id'],**policy_metrics(s,row,.05 if family=='deepmind' else 4.)} for s,row in zip(scores,rows,strict=True)]
            result={k:v for k,v in candidate.items() if k!='metrics'}
            result.update(count=len(rows),hits=sum(a['hit'] for a in answers),top4=sum(a['top4'] for a in answers),crossEntropy=sum(a['crossEntropy'] for a in answers)/len(rows),answers=answers)
            results[family].append(result);print(json.dumps({k:v for k,v in result.items() if k!='answers'}),flush=True)
    selected={family:{'winner':{k:v for k,v in choose_candidate(items).items() if k!='answers'},'control':{k:v for k,v in next(i for i in items if i['id']=='control').items() if k!='answers'}} for family,items in results.items()}
    report={'validationSHA256':sha(data),'manifestSHA256':sha(manifest_path),'dataProtocolSHA256':sha(out/'data-protocol.json'),'results':results,'selected':selected,'sourceHashes':{p:sha(ROOT/p) for p in ['tools/v8_select.py','tools/v8_evaluate.py','tools/v8-score-sparse.mjs','evaluation/v0.8/PROTOCOL.md','src/engine.mjs','src/network.mjs','spikes/deepmind-9m/action_value.py','spikes/deepmind-9m/model.py','spikes/deepmind-9m/engine_cleanup.py']}}
    require_unfrozen(folder)
    (out/'validation-results.json').write_text(json.dumps(report,indent=2)+'\n')
    freeze={'frozenAt':time.time(),'selected':selected,'validationSHA256':sha(data),'dataProtocolSHA256':report['dataProtocolSHA256'],'manifestSHA256':sha(manifest_path),'reportSHA256':sha(out/'validation-results.json'),'sourceHashes':report['sourceHashes']}
    text=json.dumps(freeze,indent=2)+'\n'
    with (folder/'selection.json').open('x') as f:f.write(text)
    (out/'selection.json').write_text(text)
    print(json.dumps({'frozen':selected}),flush=True)
if __name__=='__main__':main()
