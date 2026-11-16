"""Clean source restore, full tests, build, extracted runtime and hash verification."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
tracked_inputs = ['public','src','laptop','tools','tests','docs','package.json','package-lock.json','README.md','LICENSE','evaluation']
receipt = {'steps': [], 'sourceHashes': {}}
for name in tracked_inputs:
    path = root/name
    for file in (sorted(path.rglob('*')) if path.is_dir() else [path]):
        if file.is_file() and '__pycache__' not in file.parts and file.suffix != '.png' and not file.name.startswith('release-'):
            receipt['sourceHashes'][str(file.relative_to(root))] = hashlib.sha256(file.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='astra-release-') as tmp:
    clean = Path(tmp)/'source'
    clean.mkdir()
    for name in tracked_inputs:
        source = root/name
        if source.is_dir():
            shutil.copytree(source, clean/name, ignore=shutil.ignore_patterns('__pycache__','release-*.json'))
        else:
            shutil.copy2(source,clean/name)
    env = os.environ.copy()
    env['ASTRA_BROWSER_TESTS']='1'
    browsers = sorted((Path.home()/'.cache/ms-playwright').glob('chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
    if 'ASTRA_CHROMIUM' not in env and browsers:
        env['ASTRA_CHROMIUM']=str(browsers[-1])
    for command in [['npm','ci','--ignore-scripts','--no-audit','--no-fund'], ['npm','test'], ['npm','run','build']]:
        result=subprocess.run(command,cwd=clean,env=env,text=True,capture_output=True,timeout=240)
        print(result.stdout,flush=True)
        if result.returncode:
            print(result.stderr,flush=True)
            raise RuntimeError(f'Failed: {command}')
        receipt['steps'].append({'command':command,'exitCode':result.returncode,'stdout':result.stdout})
    archive=clean/'dist/downloads/astra-chess-laptop.zip'
    extracted=Path(tmp)/'extracted'
    with zipfile.ZipFile(archive) as z:
        z.extractall(extracted)
    manifest=json.loads((extracted/'models/manifest.json').read_text())
    receipt['modelHashes']={}
    for model in manifest['models']:
        digest=hashlib.sha256((extracted/'models'/model['file']).read_bytes()).hexdigest()
        assert digest==model['sha256']
        receipt['modelHashes'][model['id']]=digest
        command=['node','laptop/cli.mjs','--model',model['id']]
        result=subprocess.run(command,cwd=extracted,text=True,input='uci\nisready\nposition startpos moves e2e4\ngo\nquit\n',capture_output=True,check=True,timeout=30)
        assert 'id author Astra-directed, Sol-assisted' in result.stdout
        assert 'readyok' in result.stdout and 'bestmove ' in result.stdout
        receipt['steps'].append({'command':command,'environment':'isolated extracted zip without node_modules','stdout':result.stdout,'exitCode':result.returncode})
        print(result.stdout,flush=True)
    receipt['archiveBytes']=archive.stat().st_size
    receipt['archiveSHA256']=hashlib.sha256(archive.read_bytes()).hexdigest()
receipt['note']='Clean-candidate archive tested; timestamps may differ from delivery ZIP. Runtime and model inputs are bound above. Later documentation-only repacks require rechecking delivered models and executing extracted runtime.'
(root/'evaluation/release-clean.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({key:value for key,value in receipt.items() if key not in ['steps','sourceHashes']},indent=2))
