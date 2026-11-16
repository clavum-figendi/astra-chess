"""Frozen adaptation evaluation: fresh positions and paired actual-engine games."""
import hashlib,json,os,subprocess,time
from pathlib import Path
import chess,chess.engine,chess.pgn
import torch
from action_value import load_converted,encode_state_actions,expected_values,rank_legal
ROOT=Path(__file__).resolve().parents[2];DIR=ROOT/'.cache/deepmind-v5';OUT=ROOT/'evaluation/v0.5'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
torch.set_num_threads(1)
selection_path=DIR/'selection.json';selection=json.loads(selection_path.read_text());selection_sha=sha(selection_path)
if sha(OUT/'adaptation.json')!=selection['adaptationSHA256']:raise RuntimeError('Adaptation receipt changed')
base_path=ROOT/'.cache/research/deepmind-9m-action-value.pt';adapted_path=DIR/'adapted.pt'
if sha(base_path)!=selection['baseCheckpointSHA256'] or sha(adapted_path)!=selection['adaptedSHA256']:raise RuntimeError('Frozen weights changed')
lock=DIR/'test-exposed.json'
if lock.exists():
    if json.loads(lock.read_text())['selectionSHA256']!=selection_sha:raise RuntimeError('Different selection after test exposure')
else:
    with lock.open('x') as f:json.dump({'selectionSHA256':selection_sha,'exposedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},f)
protocol_data=json.loads((OUT/'data-protocol.json').read_text());test_path=DIR/'test.json'
if sha(test_path)!=protocol_data['splitSHA256']['test']:raise RuntimeError('Test data changed')
labels=json.loads(test_path.read_text());base,_=load_converted(base_path);adapted,_=load_converted(adapted_path)
for name,value in base.state_dict().items():
    if not name.startswith('head.') and not torch.equal(value,adapted.state_dict()[name]):raise RuntimeError('Encoder differs')
# Share equal encoder modules after checking every tensor, reducing peak RAM.
for attr in ['token_embedding','position_embedding','blocks','final_norm']:setattr(adapted,attr,getattr(base,attr))
models={'pretrained':base,'adapted':adapted}
book=json.loads((ROOT/'public/openings.json').read_text());families={}
for g in protocol_data['games']:
    if g['split']=='test' and g['group'] not in families:families[g['group']]=g['index']
family_keys=list(families);starts=[]
for group in [family_keys[0],family_keys[-1]]:
    board=chess.Board();moves=[]
    for san in book['lines'][families[group]]['moves'].split():move=board.parse_san(san);board.push(move);moves.append(move.uci())
    starts.append({'group':group,'opening':moves})
sources={str(p.relative_to(ROOT)):sha(p) for p in [Path(__file__),Path(__file__).with_name('action_value.py'),Path(__file__).with_name('model.py'),ROOT/'src/engine.mjs',ROOT/'src/network.mjs',ROOT/'laptop/cli.mjs',ROOT/'laptop/protocol.mjs']}
protocol={'selectionSHA256':selection_sha,'testSHA256':sha(test_path),'sources':sources,'starts':starts,'opponents':{'stockfish':3,'gnuchess':1},'maxPlies':160,'book':False,'repetitionAdjustment':True,'legacyModelSHA256':sha(ROOT/'public/models/atlas.bin')}
protocol_sha=hashlib.sha256(json.dumps(protocol,sort_keys=True).encode()).hexdigest();path=OUT/'final-results.json'
r=json.loads(path.read_text()) if path.exists() else {'protocol':protocol,'protocolSHA256':protocol_sha,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'positions':{},'games':[]}
if r['protocolSHA256']!=protocol_sha:raise RuntimeError('Different evaluation protocol')
def save():path.write_text(json.dumps(r,indent=2)+'\n')
if 'legacy-atlas' not in r['positions']:
    program="import fs from 'node:fs';import{parseModel}from'./src/network.mjs';import{chooseMove}from'./src/engine.mjs';const b=fs.readFileSync('public/models/atlas.bin'),m=parseModel(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(r=>({id:r.id,move:chooseMove(r.fen,m).move}))));"
    answers=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],cwd=ROOT,input=json.dumps(labels),text=True))
    assert len(answers)==len(labels)
    r['positions']['legacy-atlas']=answers;save()
for model_id in models:r['positions'].setdefault(model_id,[])
seen={x['id'] for x in r['positions']['pretrained']};cache_dir=DIR/'test-features';cache_dir.mkdir(exist_ok=True)
for n,row in enumerate(labels):
    if row['id'] in seen and any(x['id']==row['id'] for x in r['positions']['adapted']):continue
    legal=row['legal'];board=chess.Board(row['fen'])
    if set(legal)!={m.uci() for m in board.legal_moves}:raise RuntimeError('Legal mask mismatch')
    cache=cache_dir/(row['id']+'.pt')
    if cache.exists():
        entry=torch.load(cache,map_location='cpu',weights_only=True)
        if entry['baseSHA256']!=selection['baseCheckpointSHA256'] or entry['legal']!=legal:raise RuntimeError('Test cache mismatch')
        features=entry['features']
    else:
        with torch.no_grad():features=torch.cat([base.forward_features(encode_state_actions(row['fen'],legal[i:i+8])).detach() for i in range(0,len(legal),8)])
        torch.save({'baseSHA256':selection['baseCheckpointSHA256'],'legal':legal,'features':features},cache)
    for model_id,model in models.items():
        if any(x['id']==row['id'] for x in r['positions'][model_id]):continue
        with torch.no_grad():values=torch.cat([expected_values(model.head(x)) for x in features.split(8)]).tolist()
        best=max(range(len(legal)),key=lambda i:(values[i],-i));r['positions'][model_id].append({'id':row['id'],'move':legal[best],'expectedValue':values[best]})
    save()
    if (n+1)%20==0:print(json.dumps({'testPositions':n+1,'total':len(labels)}),flush=True)
r['positionSummary']=[]
for model_id,answers in r['positions'].items():
    by_id={a['id']:a for a in answers};assert len(by_id)==len(labels)
    hits=sum(by_id[x['id']]['move']==x['bestmove'] for x in labels);top4=sum(by_id[x['id']]['move'] in {m['move'] for m in x['teacher']} for x in labels)
    r['positionSummary'].append({'id':model_id,'positions':len(labels),'top1':hits/len(labels),'top4':top4/len(labels)})
save();print(json.dumps({'positions':r['positionSummary']}),flush=True)
for start in starts:
 for kind,depth in protocol['opponents'].items():
  for color in [chess.WHITE,chess.BLACK]:
   for model_id in ['legacy-atlas','pretrained','adapted']:
    key=f"{start['group']}/{kind}/{color}/{model_id}"
    if any(g['key']==key for g in r['games']):continue
    executable=ROOT/'.cache/engines/root/usr/games'/kind;env=os.environ.copy();env['PATH']=str(executable.parent)+os.pathsep+env.get('PATH','')
    command=[str(executable)]+(['--uci'] if kind=='gnuchess' else [])
    opponent=chess.engine.SimpleEngine.popen_uci(command,cwd=executable.parent,env=env,timeout=30)
    options={k:v for k,v in {'Threads':1,'Hash':16,'OwnBook':False}.items() if k in opponent.options};opponent.configure(options)
    legacy=None;decisions=[];board=chess.Board();game=chess.pgn.Game();game.headers['White']=model_id if color else opponent.id.get('name',kind);game.headers['Black']=opponent.id.get('name',kind) if color else model_id;node=game
    try:
     if model_id=='legacy-atlas':legacy=chess.engine.SimpleEngine.popen_uci(['node','laptop/cli.mjs','--model','atlas','--no-book'],cwd=ROOT,timeout=30)
     for text in start['opening']:
      move=chess.Move.from_uci(text);assert move in board.legal_moves;board.push(move);node=node.add_variation(move)
     while not board.is_game_over(claim_draw=True) and len(board.move_stack)<160:
      before=board.fen();started=time.monotonic()
      if board.turn==color:
       if legacy:move=legacy.play(board,chess.engine.Limit(time=1),ponder=False).move
       else:move=chess.Move.from_uci(rank_legal(models[model_id],board,batch_size=8)[0]['move'])
       decisions.append({'ply':len(board.move_stack)+1,'fen':before,'move':move.uci(),'seconds':time.monotonic()-started})
      else:move=opponent.play(board,chess.engine.Limit(depth=depth),ponder=False).move
      if move not in board.legal_moves:raise RuntimeError('Illegal engine/model move')
      board.push(move);node=node.add_variation(move)
     outcome=board.outcome(claim_draw=True);result=outcome.result() if outcome else '*';termination=outcome.termination.name.lower() if outcome else 'ply-cap';game.headers['Result']=result;game.headers['Termination']=termination
     entry={'key':key,'model':model_id,'color':'w' if color else 'b','opponent':dict(opponent.id),'engineSHA256':sha(executable),'settings':options,'limit':{'depth':depth},'openingGroup':start['group'],'result':result,'termination':termination,'plies':len(board.move_stack),'decisions':decisions,'pgn':str(game)}
     r['games'].append(entry);save();print(json.dumps({'game':key,'result':result,'termination':termination,'plies':len(board.move_stack)}),flush=True)
    finally:
     if legacy:legacy.quit()
     opponent.quit()
r['gameSummary']=[]
for model_id in ['legacy-atlas','pretrained','adapted']:
 games=[g for g in r['games'] if g['model']==model_id]
 r['gameSummary'].append({'id':model_id,'games':len(games),'wins':sum(g['result']==('1-0' if g['color']=='w' else '0-1') for g in games),'losses':sum(g['result']==('0-1' if g['color']=='w' else '1-0') for g in games),'draws':sum(g['result']=='1/2-1/2' for g in games),'unresolved':sum(g['result']=='*' for g in games)})
for name,digest in sources.items():assert sha(ROOT/name)==digest
assert sha(base_path)==selection['baseCheckpointSHA256'] and sha(adapted_path)==selection['adaptedSHA256']
r['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());save();(OUT/'matches.pgn').write_text('\n\n'.join(g['pgn'] for g in r['games'])+'\n');print(json.dumps({'complete':True,'summary':r['gameSummary']}),flush=True)
