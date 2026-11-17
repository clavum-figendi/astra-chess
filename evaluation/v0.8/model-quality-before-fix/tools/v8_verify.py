"""Parent readback audit of frozen V8 evidence; no fitting or selection changes."""
import hashlib, io, json, subprocess, sys
from pathlib import Path
import chess, chess.pgn, torch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted,rank_legal
from v8_evaluate import summarize_games
from v8_select import sha

def main():
 torch.set_num_threads(1);out=ROOT/'evaluation/v0.8';folder=ROOT/'.cache/v8'
 final=json.loads((out/'final-results.json').read_text());frozen=json.loads((folder/'selection.json').read_text());assert final.get('finishedAt')
 assert sha(folder/'selection.json')==final['selectionSHA256'];assert sha(ROOT/'tools/v8_evaluate.py')==final['evaluatorSHA256']
 for p,h in frozen['sourceHashes'].items():assert sha(ROOT/p)==h,p
 splits={s:json.loads((folder/f'{s}.json').read_text()) for s in ['validation','test']}
 protocol=json.loads((out/'data-protocol.json').read_text());assert sha(out/'data-protocol.json')==frozen['dataProtocolSHA256']
 for s,rows in splits.items():assert sha(folder/f'{s}.json')==protocol['splitSHA256'][s]
 key=lambda row:' '.join(row['fen'].split()[:2])
 old=[]
 for version in ['v0.3','v0.4']:
  for split in ['train','validation','test']:old+=json.loads((ROOT/f'evaluation/{version}/data/{split}.json').read_text())
 for split in ['train','validation','test']:old+=json.loads((ROOT/f'.cache/deepmind-v5/{split}.json').read_text())
 for split in ['validation','test']:old+=json.loads((ROOT/f'.cache/v7/{split}.json').read_text())
 prior={key(r) for r in old};all_new=[r for rows in splits.values() for r in rows]
 assert len({key(r) for r in all_new})==len(all_new) and not prior.intersection(key(r) for r in all_new)
 assert not {r['group'] for r in splits['validation']}.intersection(r['group'] for r in splits['test'])
 for row in all_new:
  legal=sorted(m.uci() for m in chess.Board(row['fen']).legal_moves);assert legal==row['legal'] and row['bestmove'] in legal
  assert len({m['move'] for m in row['teacher']})==len(row['teacher']) and all(m['move'] in legal for m in row['teacher'])
 game_samples=[];plies=0
 for g in final['games']:
  parsed=chess.pgn.read_game(io.StringIO(g['pgn']));assert not parsed.errors
  board=parsed.board();decisions={d['ply']:d for d in g['decisions']};seen=[]
  for move in parsed.mainline_moves():
   if board.ply()+1 in decisions:
    d=decisions[board.ply()+1];assert d['fen']==board.fen() and d['move']==move.uci();assert board.turn==(g['color']=='w');seen.append(d['ply'])
    if len(seen)==1 or len(seen)==len(decisions):game_samples.append((g['model'],board.copy(stack=True),d['move']))
   assert move in board.legal_moves;board.push(move);plies+=1
  assert len(seen)==len(decisions) and board.ply()==g['plies']
  outcome=board.outcome(claim_draw=True);assert g['result']==(outcome.result() if outcome else '*')
  assert g['termination']==(outcome.termination.name.lower() if outcome else 'ply-cap')
  assert sha(ROOT/'.cache/engines/root/usr/games/stockfish')==g['engineSHA256']
 for name in final['records']:
  games=[g for g in final['games'] if g['model']==name];assert summarize_games(games)==final['gameSummary'][name]
  answers=final['positions'][name];assert len(answers)==len(splits['test'])
  assert sum(a['move']==r['bestmove'] for a,r in zip(answers,splits['test'],strict=True))==final['positionSummary'][name]['hits']
 sparse={k:v for k,v in final['records'].items() if v['family']!='deepmind'}
 program="import fs from 'node:fs';import{parseModel}from'./src/network.mjs';import{chooseMove}from'./src/engine.mjs';const q=JSON.parse(fs.readFileSync(0,'utf8'));const out={};for(const [id,r] of Object.entries(q.models)){const b=fs.readFileSync(r.file),m=parseModel(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));out[id]=q.rows.map(x=>chooseMove(x.fen,m).move);}console.log(JSON.stringify(out));"
 actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],input=json.dumps({'models':sparse,'rows':splits['test']}),text=True,cwd=ROOT))
 for name,moves in actual.items():assert moves==[r['move'] for r in final['positions'][name]]
 transformers={k:load_converted(ROOT/v['file'])[0] for k,v in final['records'].items() if v['family']=='deepmind'}
 indices=sorted(set([0,1,2,len(splits['test'])-3,len(splits['test'])-2,len(splits['test'])-1]));neural_checks=0
 for name,model in transformers.items():
  for index in indices:
   assert rank_legal(model,chess.Board(splits['test'][index]['fen']),batch_size=8)[0]['move']==final['positions'][name][index]['move'];neural_checks+=1
  for sample_name,board,move in game_samples:
   if sample_name==name:assert rank_legal(model,board,batch_size=8)[0]['move']==move;neural_checks+=1
 for record in final['records'].values():assert sha(ROOT/record['file'])==record['sha256']
 receipt={'verifierSHA256':sha(Path(__file__)),'selectionSHA256':sha(folder/'selection.json'),'finalResultsSHA256':sha(out/'final-results.json'),'dataCounts':{s:len(r) for s,r in splits.items()},'priorUniqueBoardSideIDs':len(prior),'allNewBoardsDisjoint':True,'wholeFamilySplitDisjoint':True,'legalMasksIndependentlyVerified':len(all_new),'allGamesReplayed':len(final['games']),'pliesReplayed':plies,'allOutcomeSummariesRecomputed':True,'sparseRawPositionReexecutions':sum(len(m) for m in actual.values()),'deepmindRawPositionAndHistoryReexecutions':neural_checks,'scope':'All PGNs/outcomes and sparse heldout moves; sampled DeepMind heldout and first/last decisions with full history, not an exhaustive DeepMind re-execution.'}
 (out/'parent-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
if __name__=='__main__':main()
