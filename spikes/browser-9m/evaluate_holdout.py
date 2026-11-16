"""Evaluate the already-selected compressed model without changing selection."""
import hashlib,json,sys
from pathlib import Path
import onnxruntime as ort
from evaluate_python import rank_rows
ROOT=Path(__file__).resolve().parents[2]
model=ROOT/'public/models/deepmind-9m-fp16.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest()=='4faa374e93c82e92f4f443cf36d9d2fdc98e22d69991cdc6d0d6a3ecdbe3957e'
rows=json.loads((ROOT/'.cache/deepmind-v5/test.json').read_text())
reference={x['id']:x['move'] for x in json.loads((ROOT/'evaluation/v0.5/final-results.json').read_text())['positions']['adapted']}
options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
session=ort.InferenceSession(str(model),options,providers=['CPUExecutionProvider'])
answers=rank_rows(None,session,rows)
result={'modelSHA256':hashlib.sha256(model.read_bytes()).hexdigest(),'positions':len(answers),'referenceAgreements':sum(x['top']==reference[x['id']] for x in answers),'teacherHits':sum(x['top']==x['teacherBest'] for x in answers),'selectionChanged':False,'answers':answers}
(ROOT/'evaluation/v0.6/heldout-onnx.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='answers'}))
