"""Frozen v7 held-out and paired engine evaluation; no fitting in this program."""
import hashlib,io,json,os,subprocess,sys,time
from pathlib import Path
import chess,chess.engine,chess.pgn
import torch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
from action_value import load_converted,encode_state_actions,expected_values,rank_legal
from engine_cleanup import close_engines

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 torch.set_num_threads(1);folder=ROOT/'.cache/v7';out=ROOT/'evaluation/v0.7'
 selection=json.loads((folder/'selection.json').read_text());selection_sha=sha(folder/'selection.json')
 lock=folder/'test-exposed.json'
 if not lock.exists():lock.write_text(json.dumps({'selectionSHA256':selection_sha,'evaluatorSHA256':sha(Path(__file__)),'exposedAt':time.time()}))
 else:assert json.loads(lock.read_text())['selectionSHA256']==selection_sha
 protocol=json.loads((out/'data-protocol.json').read_text());assert sha(out/'data-protocol.json')==selection['dataProtocolSHA256']
 assert sha(folder/'test.json')==protocol['splitSHA256']['test'];rows=json.loads((folder/'test.json').read_text())
 base=ROOT/selection['deepmind']['controlFile'];adapted=ROOT/selection['deepmind']['file'];assert sha(base)==selection['deepmind']['controlSHA256'] and sha(adapted)==selection['deepmind']['sha256']
 old,_=load_converted(base);new,_=load_converted(adapted)
 for k,v in old.state_dict().items():
  if not k.startswith('head.'):assert torch.equal(v,new.state_dict()[k])
 for name in ['token_embedding','position_embedding','blocks','final_norm']:setattr(new,name,getattr(old,name))
 models={'deepmind-v6':old,'deepmind-v7':new};sparse=[selection['sparse'][f]['winner'] for f in ['pocket','atlas']]
 for item in sparse:assert sha(ROOT/item['file'])==item['sha256']
 sourceSHA=sha(Path(__file__));file=out/'final-results.json'
 r=json.loads(file.read_text()) if file.exists() else {'selectionSHA256':selection_sha,'evaluatorSHA256':sourceSHA,'positions':{},'games':[]}
 assert r['selectionSHA256']==selection_sha and r['evaluatorSHA256']==sourceSHA
 def save():file.write_text(json.dumps(r,indent=2)+'\n')
 if not r['positions']:
  for name in models:r['positions'][name]=[]
  for index,row in enumerate(rows):
   legal=row['legal']
   with torch.no_grad():features=torch.cat([old.forward_features(encode_state_actions(row['fen'],legal[i:i+8])) for i in range(0,len(legal),8)])
   for name,model in models.items():
    with torch.no_grad():values=torch.cat([expected_values(model.head(x)) for x in features.split(8)]).tolist()
    best=max(range(len(legal)),key=lambda i:(values[i],-i));r['positions'][name].append({'id':row['id'],'move':legal[best]})
   if (index+1)%20==0:print('Test positions',index+1,flush=True)
  program="import fs from 'node:fs';import{parseModel}from'./src/network.mjs';import{chooseMove}from'./src/engine.mjs';const input=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(Object.fromEntries(input.models.map(m=>{const b=fs.readFileSync(m.file),model=parseModel(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));return[m.id,input.rows.map(r=>({id:r.id,move:chooseMove(r.fen,model).move}))]}))));"
  r['positions'].update(json.loads(subprocess.check_output(['node','--input-type=module','-e',program],input=json.dumps({'models':sparse,'rows':rows}),text=True,cwd=ROOT)));save()
 r['positionSummary']=[]
 for name,answers in r['positions'].items():
  by_id={a['id']:a['move'] for a in answers};assert len(by_id)==len(rows)
  for row in rows:assert by_id[row['id']] in row['legal']
  r['positionSummary'].append({'id':name,'count':len(rows),'hits':sum(by_id[row['id']]==row['bestmove'] for row in rows),'top4':sum(by_id[row['id']] in [x['move'] for x in row['teacher']] for row in rows)})
 save();print(json.dumps(r['positionSummary']),flush=True)
 starts=[g['group'] for g in protocol['games'] if g['split']=='test'][:2]
 for opening in starts:
  for color in [chess.WHITE,chess.BLACK]:
   for name in [*models,*[m['id'] for m in sparse]]:
    key=f'{opening}/{color}/{name}'
    if any(g['key']==key for g in r['games']):continue
    opponent=chess.engine.SimpleEngine.popen_uci(str(ROOT/'.cache/engines/root/usr/games/stockfish'),timeout=30);opponent.configure({'Threads':1,'Hash':16});legacy=None
    board=chess.Board();game=chess.pgn.Game();node=game;decisions=[]
    game.headers['White']=name if color else 'Stockfish 17.1 depth3';game.headers['Black']='Stockfish 17.1 depth3' if color else name
    try:
     if name not in models:legacy=chess.engine.SimpleEngine.popen_uci(['node','laptop/cli.mjs','--model',name,'--no-book'],cwd=ROOT,timeout=30)
     for san in opening.split():move=board.parse_san(san);board.push(move);node=node.add_variation(move)
     while not board.is_game_over(claim_draw=True) and board.ply()<160:
      if board.turn==color:
       move=legacy.play(board,chess.engine.Limit(time=1)).move if legacy else chess.Move.from_uci(rank_legal(models[name],board,batch_size=8)[0]['move'])
       decisions.append({'ply':board.ply()+1,'fen':board.fen(),'move':move.uci()})
      else:move=opponent.play(board,chess.engine.Limit(depth=3)).move
      assert move in board.legal_moves;board.push(move);node=node.add_variation(move)
     outcome=board.outcome(claim_draw=True);result=outcome.result() if outcome else '*';termination=outcome.termination.name.lower() if outcome else 'ply-cap';game.headers['Result']=result;game.headers['Termination']=termination
     r['games'].append({'key':key,'model':name,'color':'w' if color else 'b','result':result,'termination':termination,'plies':board.ply(),'opponent':dict(opponent.id),'engineSHA256':sha(ROOT/'.cache/engines/root/usr/games/stockfish'),'depth':3,'book':False,'decisions':decisions,'pgn':str(game)});save();print(json.dumps({'game':key,'result':result,'termination':termination}),flush=True)
    finally:close_engines(legacy,opponent)
 r['summary']=[]
 for name in [*models,*[m['id'] for m in sparse]]:
  games=[g for g in r['games'] if g['model']==name];assert len(games)==4
  r['summary'].append({'id':name,'games':len(games),'wins':sum(g['result']==('1-0' if g['color']=='w' else '0-1') for g in games),'losses':sum(g['result']==('0-1' if g['color']=='w' else '1-0') for g in games),'draws':sum(g['result']=='1/2-1/2' for g in games),'unresolved':sum(g['result']=='*' for g in games)})
 assert sha(adapted)==selection['deepmind']['sha256'] and sha(Path(__file__))==sourceSHA
 r['finishedAt']=time.time();save();(out/'matches.pgn').write_text('\n\n'.join(g['pgn'] for g in r['games'])+'\n');print(json.dumps({'complete':True,'positions':r['positionSummary'],'games':r['summary']}),flush=True)
if __name__=='__main__':main()
