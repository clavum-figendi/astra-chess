"""Extract and exercise the exact sparse laptop ZIP; evidence per archive digest."""
import hashlib,json,os,subprocess,tempfile,zipfile
from pathlib import Path
import chess,chess.engine
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 archive=ROOT/'dist/downloads/astra-chess-laptop.zip';digest=sha(archive);checks=[]
 clean_env={key:os.environ[key] for key in ['PATH','HOME','TMPDIR','LANG'] if key in os.environ}
 with tempfile.TemporaryDirectory(prefix='v8-package-') as d:
  root=Path(d)
  assert not root.resolve().is_relative_to(ROOT)
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    p=Path(name)
    assert not p.is_absolute() and '..' not in p.parts,name
    assert not any(part=='.env' or part.startswith('.env.') for part in p.parts),name
   z.extractall(root)
  probe=subprocess.run(['node','--input-type=module','-e',"try{import.meta.resolve('chess.js');process.exitCode=1;}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}"],cwd=root,env=clean_env,capture_output=True,text=True)
  assert probe.returncode==0,probe.stdout+probe.stderr
  manifest=json.loads((root/'models/manifest.json').read_text());books=json.loads((root/'books/manifest.json').read_text())['books'];assert len(manifest['models'])==2 and len(books)==3
  for model in manifest['models']:
   path=root/'models'/model['file'];assert sha(path)==model['sha256'] and path.stat().st_size==model['bytes']
  for book in books:
   assert sha((root/'books'/book['file']).resolve())==book['sha256']
   if book.get('licenseFile'):assert sha(root/'books'/book['licenseFile'])=='a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499'
  first_moves={}
  for model in manifest['models']:
   engine=chess.engine.SimpleEngine.popen_uci(['node','laptop/cli.mjs','--model',model['id'],'--no-book'],cwd=root,env=clean_env,timeout=30)
   try:
    engine.ping();board=chess.Board()
    for san in ['e4','e5','Nf3','Nc6']:board.push_san(san)
    move=engine.play(board,chess.engine.Limit(depth=1)).move;assert move in board.legal_moves
    checks.append({'model':model['id'],'uciIdentity':dict(engine.id),'noninitialPolicyMove':move.uci(),'book':False})
   finally:engine.quit()
   for book in books:
    response=json.loads(subprocess.check_output(['node','laptop/cli.mjs','--model',model['id'],'--book-source',book['id'],'--seed','archive-check','--fen',chess.Board().fen()],cwd=root,env=clean_env,text=True,timeout=45))
    assert response['source']=='book' and response['bookSource']==book['id'] and response['bookSHA256']==book['sha256']
    assert chess.Move.from_uci(response['move']) in chess.Board().legal_moves
    if book['id'] in first_moves:assert first_moves[book['id']]==response['move']
    first_moves[book['id']]=response['move'];checks.append({'model':model['id'],'book':book['id'],'move':response['move'],'sha256':response['bookSHA256']})
  record={'archiveSHA256':digest,'bytes':archive.stat().st_size,'scriptSHA256':sha(Path(__file__)),'node':subprocess.check_output(['node','--version'],text=True).strip(),'modelCount':len(manifest['models']),'bookCount':len(books),'checks':checks,'ambientChessPackageAbsent':True,'scope':'Fresh extraction of this exact ZIP outside the project, no resolvable external chess.js package and no NODE_PATH/options; real UCI and all book profiles. Node prerequisite not bundled; not a DeepMind/PyTorch bundle test.'}
 target=ROOT/f'evaluation/v0.8/package-check-{digest[:12]}.json';target.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2),flush=True)
if __name__=='__main__':main()
