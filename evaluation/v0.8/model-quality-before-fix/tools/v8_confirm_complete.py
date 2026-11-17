"""Separately named confirmation binding actual Node resolution and lineage.
Does not modify v8_confirm.py or any prior attempt's manifests/results.
"""
import hashlib,importlib.util,json,subprocess
from pathlib import Path
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def resolve_chess(root):
 url=subprocess.check_output(['node','--input-type=module','-e','console.log(import.meta.resolve("chess.js"))'],cwd=Path(root)/'src',text=True).strip()
 parsed=urlparse(url);assert parsed.scheme=='file' and not parsed.netloc
 path=Path(unquote(parsed.path)).resolve();assert path.is_file();return path
def chess_inventory(root):
 path=resolve_chess(root)
 return {str(path):sha(path),str(Path(__file__).resolve()):sha(__file__)}
def check_selection_lineage(original,repeated):
 for key in ['manifestSHA256','dataProtocolSHA256','validationSHA256']:assert original[key]==repeated[key],key

def main():
 spec=importlib.util.spec_from_file_location('v8_replay',ROOT/'tools/v8_confirm.py');assert spec and spec.loader
 replay=importlib.util.module_from_spec(spec);spec.loader.exec_module(replay)
 target=ROOT/'.cache/v8-confirmation-complete';out=ROOT/'evaluation/v0.8/confirmation-complete'
 setattr(replay,'TARGET',target);setattr(replay,'OUT',out)
 original=json.loads((ROOT/'.cache/v8/selection.json').read_text());protocol=json.loads((ROOT/'evaluation/v0.8/data-protocol.json').read_text())
 expected={'.cache/v8/validation.json':original['validationSHA256'],'.cache/v8/test.json':protocol['splitSHA256']['test'],'evaluation/v0.8/data-protocol.json':original['dataProtocolSHA256'],'evaluation/v0.8/weight-manifest.json':original['manifestSHA256']}
 base_identity=replay.runtime_identity
 def identity():
  result=base_identity();result['files'].update(chess_inventory(ROOT));result['nodeChessImporter']=str(ROOT/'src/chess.mjs');result['resolvedNodeChess']=str(resolve_chess(ROOT));return result
 setattr(replay,'runtime_identity',identity)
 base_module=replay.module
 def checked_module(name,path):
  loaded=base_module(name,path);run=loaded.main
  def checked_main():
   for relative,digest in expected.items():assert sha(target/relative)==digest,relative
   run()
   check_selection_lineage(original,json.loads((target/'.cache/v8/selection.json').read_text()))
  setattr(loaded,'main',checked_main);return loaded
 setattr(replay,'module',checked_module)
 replay.main()
 check_selection_lineage(original,json.loads((out/'selection.json').read_text()))
 receipt=json.loads((out/'receipt.json').read_text());freeze=json.loads((out/'pre-run-freeze.json').read_text())
 path=resolve_chess(ROOT);assert freeze['runtime']['files'][str(path)]==sha(path)
 evidence={'confirmationReceiptSHA256':sha(out/'receipt.json'),'preRunFreezeSHA256':sha(out/'pre-run-freeze.json'),'resolvedNodeChess':str(path),'resolvedNodeChessSHA256':sha(path),'inputLineage':expected,'allLineageDigestsMatched':True,'scope':'Post-exposure fixed-candidate reproducibility only; no new holdout or retroactive freeze.'}
 assert receipt['runtimeAndOpponentUnchangedAcrossReplay']
 (out/'resolved-lineage.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence,indent=2),flush=True)
if __name__=='__main__':main()
