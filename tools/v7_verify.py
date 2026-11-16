"""Read-only audit of frozen V7 data, tensors and complete legal game records."""
import datetime,hashlib,io,json,sys
from pathlib import Path
import chess,chess.pgn,torch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 torch.set_num_threads(1);out=ROOT/'evaluation/v0.7';cache=ROOT/'.cache/v7';selection=json.loads((cache/'selection.json').read_text());lock=json.loads((cache/'test-exposed.json').read_text());r=json.loads((out/'final-results.json').read_text())
 assert r.get('finishedAt') and r['selectionSHA256']==sha(cache/'selection.json')==lock['selectionSHA256']
 assert datetime.datetime.fromisoformat(selection['frozenAt'].replace('Z','+00:00')).timestamp()<=lock['exposedAt']
 for name,digest in selection['reportsSHA256'].items():assert sha(out/name)==digest
 protocol=json.loads((out/'data-protocol.json').read_text());assert sha(out/'data-protocol.json')==selection['dataProtocolSHA256']
 old=set()
 for version in ['v0.3','v0.4']:
  for split in ['train','validation','test']:
   for row in json.loads((ROOT/f'evaluation/{version}/data/{split}.json').read_text()):old.add(' '.join(row['fen'].split()[:2]))
 for split in ['train','validation','test']:
  for row in json.loads((ROOT/f'.cache/deepmind-v5/{split}.json').read_text()):old.add(' '.join(row['fen'].split()[:2]))
 groups={};seen=set()
 for split in ['validation','test']:
  assert sha(cache/f'{split}.json')==protocol['splitSHA256'][split];rows=json.loads((cache/f'{split}.json').read_text());groups[split]=set()
  for row in rows:
   key=' '.join(row['fen'].split()[:2]);assert key not in old and key not in seen;seen.add(key);groups[split].add(row['group'])
   assert row['id']==hashlib.sha256(key.encode()).hexdigest();assert set(row['legal'])=={m.uci() for m in chess.Board(row['fen']).legal_moves}
 assert not groups['validation']&groups['test']
 baseline,_=load_converted(ROOT/selection['deepmind']['controlFile']);candidate,_=load_converted(ROOT/selection['deepmind']['file']);changed={}
 for name,value in baseline.state_dict().items():
  n=int((value!=candidate.state_dict()[name]).sum())
  if n:changed[name]=n
  if not name.startswith('head.'):assert n==0
 assert sum(changed.values())==selection['deepmind']['changedHeadScalars']
 assert torch.equal(candidate.head.weight,baseline.head.weight*.95)
 expected=baseline.head.bias.detach().clone()*.95;expected[63]-=.05;assert torch.equal(candidate.head.bias,expected)
 assert len(r['games'])==16==len({g['key'] for g in r['games']});decisions=0
 for record in r['games']:
  game=chess.pgn.read_game(io.StringIO(record['pgn']));assert not game.errors;board=game.board();lookup={d['ply']:d for d in record['decisions']};assert len(lookup)==len(record['decisions'])
  for ply,move in enumerate(game.mainline_moves(),1):
   assert move in board.legal_moves
   if ply in lookup:
    item=lookup[ply];assert item['fen']==board.fen() and item['move']==move.uci() and board.turn==(record['color']=='w');decisions+=1
   board.push(move)
  assert board.ply()==record['plies'];outcome=board.outcome(claim_draw=True)
  assert record['result']==(outcome.result() if outcome else '*')==game.headers['Result']
  assert record['termination']==(outcome.termination.name.lower() if outcome else 'ply-cap')
 report={'resultsSHA256':sha(out/'final-results.json'),'selectionSHA256':sha(cache/'selection.json'),'freshPositionIdentities':len(seen),'gamesReplayed':len(r['games']),'decisionsReplayed':decisions,'changedTensors':changed,'unchangedBackbone':True,'verifierSHA256':sha(Path(__file__))}
 (out/'parent-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
