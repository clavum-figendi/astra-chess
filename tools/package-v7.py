"""Package one current DeepMind checkpoint and its tested CPU runner."""
import hashlib,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 report=json.loads((ROOT/'evaluation/v0.7/browser-model.json').read_text());weight=ROOT/report['sourceCheckpoint'];assert hashlib.sha256(weight.read_bytes()).hexdigest()==report['checkpointSHA256']
 files={name:(ROOT/'spikes/deepmind-9m'/name).read_bytes() for name in ['play.py','uci.py','model.py','action_value.py']}
 files['weights/adapted.pt']=weight.read_bytes();files['LICENSE-APACHE-2.0.txt']=(ROOT/'public/DEEPMIND-CODE-LICENSE.txt').read_bytes()
 files['requirements.txt']=b'numpy==2.5.4\nchess==1.11.2\n'
 files['README.md']=b'''# Chess Lab 9M v0.7 laptop runner

This bundle contains the selected 8,954,240-parameter DeepMind-derived checkpoint,
not the browser ONNX artifact. Install Python and CPU PyTorch in an isolated venv:

    python -m venv .venv
    # Activate .venv for your platform, then:
    python -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
    python -m pip install -r requirements.txt
    python play.py --weights weights/adapted.pt

The final command starts UCI mode. A chess GUI can invoke it with absolute paths.
For one position, add --fen "<six-field FEN>". Default one CPU thread; optional
--threads 1..8 and --batch-size 1..64. This research runner is neural-only, without
an opening book, and performs one fixed evaluation of legal candidates regardless
of UCI search-depth/time limits. Python/PyTorch are not bundled.

Original weights: Google DeepMind searchless_chess, revision
90ae0e6b121673fc3079aaeffa047580bb600c0a, checkpoint 9M/6400000/params.
https://github.com/google-deepmind/searchless_chess
Weights: CC-BY-4.0 https://creativecommons.org/licenses/by/4.0/
Changes: Haiku-to-PyTorch conversion, Stockfish-policy head fitting and bounded v7
head adjustment. Encoder unchanged. No endorsement implied. Code Apache-2.0;
full license included. model.py supplies shared blocks/tokenization; its unrelated
experimental BC entry point is not used. Run play.py only.

See RELEASE-V7.md for measured outcomes and limits. SHA256SUMS.json identifies
all packaged bytes. The head adjustment retained 55/93 final teacher matches and
3W/1D against depth-3 Stockfish, equal to its control; no stronger-play claim.
'''
 files['RELEASE-V7.md']=(ROOT/'docs/RELEASE-V7.md').read_bytes()
 for name in ['selection.json','final-results.json','parent-verification.json','browser-model.json']:files['evidence/'+name]=(ROOT/'evaluation/v0.7'/name).read_bytes()
 manifest={name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in files.items()}
 target=ROOT/'.cache/v7/chess-lab-9m-laptop.zip'
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,data in files.items():z.writestr(name,data)
  z.writestr('SHA256SUMS.json',json.dumps(manifest,indent=2)+'\n')
 print(target,target.stat().st_size,hashlib.sha256(target.read_bytes()).hexdigest())
if __name__=='__main__':main()
