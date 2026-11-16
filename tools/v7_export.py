"""Promote only non-regressing frozen head; export without changing v6 artifacts."""
import hashlib,json,sys
from pathlib import Path
import numpy as np,onnxruntime as ort,torch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'spikes/browser-9m'));sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from export_onnx import export_float32,create_fp16_storage
from action_value import load_converted,encode_state_actions,expected_values

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 torch.set_num_threads(1);folder=ROOT/'.cache/v7';out=ROOT/'evaluation/v0.7';selection=json.loads((folder/'selection.json').read_text());r=json.loads((out/'final-results.json').read_text());assert r.get('finishedAt')
 summaries={x['id']:x for x in r['summary']};positions={x['id']:x for x in r['positionSummary']};score=lambda name:summaries[name]['wins']+.5*summaries[name]['draws']
 accepted=positions['deepmind-v7']['hits']>=positions['deepmind-v6']['hits'] and score('deepmind-v7')>=score('deepmind-v6') and summaries['deepmind-v7']['unresolved']==0
 path=ROOT/(selection['deepmind']['file'] if accepted else selection['deepmind']['controlFile']);expected=selection['deepmind']['sha256'] if accepted else selection['deepmind']['controlSHA256'];assert sha(path)==expected
 model,metadata=load_converted(path);target=folder/'onnx';target.mkdir(exist_ok=True)
 full=target/'deepmind-9m-v7-f32.onnx';half=target/'deepmind-9m-v7.onnx';export_float32(model,full);create_fp16_storage(full,half)
 options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
 session=ort.InferenceSession(str(half),options,providers=['CPUExecutionProvider'])
 rows=json.loads((folder/'validation.json').read_text());records=[]
 for n,row in enumerate(rows):
  legal=row['legal'];a=[];b=[]
  with torch.no_grad():
   for i in range(0,len(legal),4):
    tokens=encode_state_actions(row['fen'],legal[i:i+4]);a.extend(expected_values(model(tokens)).tolist());b.extend(expected_values(torch.from_numpy(session.run(None,{'tokens':tokens.numpy()})[0])).tolist())
  best=lambda values:legal[max(range(len(legal)),key=lambda i:(values[i],-i))]
  records.append({'id':row['id'],'reference':best(a),'onnx':best(b),'bestmove':row['bestmove'],'maxValueError':max(abs(x-y) for x,y in zip(a,b))})
  if (n+1)%20==0:print('Compression validation',n+1,flush=True)
 agreements=sum(x['reference']==x['onnx'] for x in records);loss=sum(x['reference']==x['bestmove'] for x in records)-sum(x['onnx']==x['bestmove'] for x in records)
 chosen=half if agreements/len(records)>=.95 and loss<=2 else full
 report={'promotedHead':accepted,'scope':'policy calibration; no increase in held-out hits or match points is implied','sourceCheckpoint':str(path.relative_to(ROOT)),'checkpointSHA256':sha(path),'file':str(chosen.relative_to(ROOT)),'sha256':sha(chosen),'bytes':chosen.stat().st_size,'variant':'fp16-storage' if chosen==half else 'float32','validationPositions':len(records),'referenceAgreements':agreements,'teacherHitLoss':loss,'records':records,'metadata':metadata}
 (out/'browser-model.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['records','metadata']}),flush=True)
if __name__=='__main__':main()
