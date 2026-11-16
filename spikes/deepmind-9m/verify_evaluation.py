"""Independent final-boundary verification, including fresh encoder recomputation."""
import hashlib,io,json,time
from pathlib import Path
import chess,chess.engine,chess.pgn
import torch
from action_value import load_converted,encode_state_actions,expected_values,rank_legal
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 torch.set_num_threads(1)
 out=ROOT/'evaluation/v0.5';cache=ROOT/'.cache/deepmind-v5'
 selection=json.loads((cache/'selection.json').read_text())
 paths={'pretrained':ROOT/'.cache/research/deepmind-9m-action-value.pt','adapted':cache/'adapted.pt'}
 assert sha(paths['pretrained'])==selection['baseCheckpointSHA256']
 assert sha(paths['adapted'])==selection['adaptedSHA256']
 models={k:load_converted(p)[0] for k,p in paths.items()}
 r=json.loads((out/'final-results.json').read_text());protocol=r['protocol']
 assert sha(cache/'selection.json')==protocol['selectionSHA256']
 assert sha(cache/'test.json')==protocol['testSHA256']
 assert sha(ROOT/'public/models/atlas.bin')==protocol['legacyModelSHA256']
 for name,digest in protocol['sources'].items():assert sha(ROOT/name)==digest,name
 rows=json.loads((cache/'test.json').read_text());max_delta=0.
 for n,row in enumerate(rows):
  legal=row['legal'];assert set(legal)=={m.uci() for m in chess.Board(row['fen']).legal_moves}
  with torch.no_grad():features=torch.cat([models['pretrained'].forward_features(encode_state_actions(row['fen'],legal[i:i+8])) for i in range(0,len(legal),8)])
  cached=torch.load(cache/'test-features'/(row['id']+'.pt'),weights_only=True)
  delta=(features-cached['features']).abs().max().item();max_delta=max(max_delta,delta)
  assert torch.equal(features,cached['features']),(row['id'],delta)
  for name,model in models.items():
   with torch.no_grad():values=torch.cat([expected_values(model.head(x)) for x in features.split(8)]).tolist()
   index=max(range(len(legal)),key=lambda i:(values[i],-i));answer=next(x for x in r['positions'][name] if x['id']==row['id'])
   assert answer['move']==legal[index] and answer['expectedValue']==values[index]
  if (n+1)%25==0:print('Fresh encoder positions',n+1,flush=True)
 # Re-read after the expensive independent cache audit; require the complete run.
 r=json.loads((out/'final-results.json').read_text());assert r.get('finishedAt'),'Tournament not finished'
 expected=len(protocol['starts'])*len(protocol['opponents'])*2*3
 assert len(r['games'])==expected==len({g['key'] for g in r['games']})
 decision_count=0;spot_checks=[];summary=[]
 for g in r['games']:
  game=chess.pgn.read_game(io.StringIO(g['pgn']));assert not game.errors
  board=game.board();decisions={d['ply']:d for d in g['decisions']};assert len(decisions)==len(g['decisions'])
  midpoint=g['decisions'][len(g['decisions'])//2]['ply'];sample=None
  for ply,move in enumerate(game.mainline_moves(),1):
   assert move in board.legal_moves
   if ply in decisions:
    d=decisions[ply];assert d['fen']==board.fen() and d['move']==move.uci()
    assert board.turn==(g['color']=='w');decision_count+=1
    if ply==midpoint:sample=board.copy(stack=True)
   board.push(move)
  assert len(board.move_stack)==g['plies']
  outcome=board.outcome(claim_draw=True)
  assert g['result']==(outcome.result() if outcome else '*')==game.headers['Result']
  assert g['termination']==(outcome.termination.name.lower() if outcome else 'ply-cap')
  if not outcome:assert g['plies']==protocol['maxPlies']
  opponent='stockfish' if 'Stockfish' in g['opponent']['name'] else 'gnuchess'
  assert sha(ROOT/'.cache/engines/root/usr/games'/opponent)==g['engineSHA256']
  if g['model']=='legacy-atlas':
   engine=chess.engine.SimpleEngine.popen_uci(['node','laptop/cli.mjs','--model','atlas','--no-book'],cwd=ROOT,timeout=15)
   try:actual=engine.play(sample,chess.engine.Limit(time=1)).move.uci();engine.quit()
   finally:engine.close()
  else:actual=rank_legal(models[g['model']],sample,batch_size=8)[0]['move']
  assert actual==decisions[midpoint]['move'];spot_checks.append({'key':g['key'],'ply':midpoint,'move':actual})
 for name in ['legacy-atlas','pretrained','adapted']:
  games=[g for g in r['games'] if g['model']==name]
  item={'id':name,'games':len(games),'wins':sum(g['result']==('1-0' if g['color']=='w' else '0-1') for g in games),'losses':sum(g['result']==('0-1' if g['color']=='w' else '1-0') for g in games),'draws':sum(g['result']=='1/2-1/2' for g in games),'unresolved':sum(g['result']=='*' for g in games)}
  assert item==next(x for x in r['gameSummary'] if x['id']==name);summary.append(item)
 for name,digest in protocol['sources'].items():assert sha(ROOT/name)==digest
 assert sha(paths['pretrained'])==selection['baseCheckpointSHA256'] and sha(paths['adapted'])==selection['adaptedSHA256']
 result={'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'resultsSHA256':sha(out/'final-results.json'),'verifierSHA256':sha(Path(__file__)),'freshEncoderPositions':len(rows),'maxFeatureDifference':max_delta,'games':expected,'decisionsLegallyReplayed':decision_count,'policyReexecutions':spot_checks,'gameSummary':summary}
 (out/'verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
if __name__=='__main__':main()
