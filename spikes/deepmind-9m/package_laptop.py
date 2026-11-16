"""Package the verified research models without changing the frozen artifacts."""
import hashlib,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 out=ROOT/'evaluation/v0.5';results=(out/'final-results.json').read_bytes();r=json.loads(results)
 verification=json.loads((out/'verification.json').read_text())
 assert r.get('finishedAt') and verification['resultsSHA256']==sha(results)
 files={}
 for name in ['play.py','uci.py','action_value.py','model.py']:files[name]=(Path(__file__).parent/name).read_bytes()
 for name,path in [('pretrained.pt','.cache/research/deepmind-9m-action-value.pt'),('adapted.pt','.cache/deepmind-v5/adapted.pt')]:files['weights/'+name]=(ROOT/path).read_bytes()
 selection=json.loads((ROOT/'.cache/deepmind-v5/selection.json').read_text())
 assert sha(files['weights/pretrained.pt'])==selection['baseCheckpointSHA256']
 assert sha(files['weights/adapted.pt'])==selection['adaptedSHA256']
 for name in ['final-results.json','verification.json','adaptation.json','data-protocol.json','matches.pgn']:files['evidence/'+name]=(out/name).read_bytes()
 for name in ['REVIEW-V5-ADAPTATION.md','PUBLISHED-ARCHITECTURES.md']:files['docs/'+name]=(ROOT/'docs'/name).read_bytes()
 files['docs/ACTION-VALUE.md']=(Path(__file__).parent/'ACTION-VALUE.md').read_bytes()
 files['LICENSE-APACHE-2.0.txt']=Path('/usr/share/common-licenses/Apache-2.0').read_bytes()
 files['requirements.txt']=b'numpy==2.5.4\nchess==1.11.2\n'
 table='\n'.join(f"| {x['id']} | {x['wins']} | {x['draws']} | {x['losses']} | {x['unresolved']} |" for x in r['gameSummary'])
 positions='\n'.join(f"| {x['id']} | {round(x['top1']*x['positions'])}/{x['positions']} | {100*x['top1']:.2f}% |" for x in r['positionSummary'])
 readme=f'''# Chess Lab 9M — local CPU research runner

Two 8,954,240-parameter search-free action-value models: the converted original
Google DeepMind checkpoint and a Stockfish-policy-adapted output head. Each
float32 checkpoint occupies approximately 36 MB; Python/PyTorch runtime and
activation memory are additional. These files are for the laptop Python runner,
not replacements for the existing browser's sparse-network binary format.

## Run

Create an isolated Python environment. Tested here with PyTorch 2.15.0+cpu,
NumPy 2.5.4 and python-chess module chess 1.11.2. Install CPU PyTorch first:

```sh
python -m venv .venv
# Activate .venv using your platform's normal activation command.
python -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
python play.py --weights weights/adapted.pt
```

The last command starts UCI mode for a chess GUI. Use weights/pretrained.pt for
the original reference. For a one-position JSON response:

```sh
python play.py --weights weights/adapted.pt --fen "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
```

Default: one CPU thread, candidate batch size 8. Options: --threads 1..8 and
--batch-size 1..64. This synchronous research runner evaluates all legal actions
once; UCI search-depth/time parameters do not change its computation. It has no
opening book and does not promise hard clock deadlines. Actual search engines
are used only as offline teachers/opponents, not by this runner.

## Frozen evaluation

147 held-out positions, Stockfish 17.1 depth-10 teacher:

| Model | Bestmove matches | Agreement |
|---|---:|---:|
{positions}

Two held-out opening families, both colors, Stockfish 17.1 depth 3 and GNU Chess
6.2.9 depth 1, 8 games per model, no opening-book decisions after fixed starts:

| Model | Wins | Draws | Losses | Unresolved caps |
|---|---:|---:|---:|---:|
{table}

Adaptation changed only 32,896 head scalars. The backbone stayed bitwise equal.
Validation selected epoch 6 before test exposure. Fine-tuning gained one test
bestmove match, with the same match score as the pretrained reference. This is
not an Elo estimate or evidence of superiority over full-strength Stockfish.
All 147 test encoder features were independently recomputed exactly; all games
and 737 recorded policy decisions were legally replayed, with one policy move
per game independently re-executed. Detailed receipts and PGNs are included.

## Attribution and licensing

Original weights: Google DeepMind searchless_chess,
https://github.com/google-deepmind/searchless_chess/tree/90ae0e6b121673fc3079aaeffa047580bb600c0a
Original archive: https://storage.googleapis.com/searchless_chess/checkpoints/9M.zip
Selected checkpoint: 9M/6400000/params (not EMA).
Weights are CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/
Changes: Haiku-to-PyTorch layout conversion; adapted.pt additionally contains
Chess Lab's policy-supervised head adaptation. No endorsement is implied.
Conversion/runtime code preserves DeepMind attribution and is Apache-2.0;
see LICENSE-APACHE-2.0.txt and source notices. model.py supplies shared blocks and
tokenization; its unrelated exploratory behavioral-cloning entry point is not
used or validated by this package. Use play.py.

SHA256SUMS.json binds every included file. Dependencies are installed separately;
this archive contains no Python interpreter, GPU runtime, or search executable.
'''
 files['README.md']=readme.encode()
 manifest={k:{'bytes':len(v),'sha256':sha(v)} for k,v in files.items()}
 target=ROOT/'.cache/chess-lab-9m-laptop.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,data in files.items():z.writestr(name,data)
  z.writestr('SHA256SUMS.json',json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'path':str(target),'bytes':target.stat().st_size,'sha256':sha(target.read_bytes()),'files':len(files)+1}))
if __name__=='__main__':main()
