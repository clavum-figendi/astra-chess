"""Frozen V8 final positions and paired real-Stockfish games, policy only."""
import json, select, subprocess, sys, time
from pathlib import Path
from v8_select import sha, policy_metrics
ROOT=Path(__file__).resolve().parents[1]

def summarize_games(games):
    return {'games':len(games),'wins':sum(g['result']==('1-0' if g['color']=='w' else '0-1') for g in games),'losses':sum(g['result']==('0-1' if g['color']=='w' else '1-0') for g in games),'draws':sum(g['result']=='1/2-1/2' and g['termination']!='ply-cap' for g in games),'unresolved':sum(g['termination']=='ply-cap' or g['result']=='*' for g in games)}

def main():
    import chess, chess.engine, chess.pgn, torch
    sys.path.insert(0,str(ROOT/'spikes/deepmind-9m'))
    from action_value import load_converted,encode_state_actions,expected_values,rank_legal
    from engine_cleanup import close_engines
    torch.set_num_threads(1);folder=ROOT/'.cache/v8';out=ROOT/'evaluation/v0.8'
    frozen=json.loads((folder/'selection.json').read_text());selection_sha=sha(folder/'selection.json')
    assert sha(out/'validation-results.json')==frozen['reportSHA256']
    for p,digest in frozen['sourceHashes'].items():assert sha(ROOT/p)==digest,p
    assert sha(out/'data-protocol.json')==frozen['dataProtocolSHA256'];protocol=json.loads((out/'data-protocol.json').read_text())
    evaluator_sha=sha(Path(__file__));lock=folder/'test-exposed.json'
    if not lock.exists():
        with lock.open('x') as f:json.dump({'selectionSHA256':selection_sha,'evaluatorSHA256':evaluator_sha,'exposedAt':time.time()},f)
    else:
        exposure=json.loads(lock.read_text());assert exposure['selectionSHA256']==selection_sha and exposure['evaluatorSHA256']==evaluator_sha
    assert sha(folder/'test.json')==protocol['splitSHA256']['test'];rows=json.loads((folder/'test.json').read_text())
    records={}
    for family,entry in frozen['selected'].items():
        records[family+'-control']={**entry['control'],'family':family}
        if entry['winner']['id']!='control':records[family+'-candidate']={**entry['winner'],'family':family}
    for record in records.values():assert sha(ROOT/record['file'])==record['sha256']
    transformers={name:load_converted(ROOT/r['file'])[0] for name,r in records.items() if r['family']=='deepmind'}
    base=transformers['deepmind-control']
    for name,model in transformers.items():
        assert all(torch.equal(v,model.state_dict()[k]) for k,v in base.state_dict().items() if not k.startswith('head.'))
    path=out/'final-results.json'
    report=json.loads(path.read_text()) if path.exists() else {'selectionSHA256':selection_sha,'evaluatorSHA256':evaluator_sha,'records':records,'positions':{k:[] for k in records},'games':[]}
    assert report['selectionSHA256']==selection_sha and report['evaluatorSHA256']==evaluator_sha
    assert report['records']==records
    def save():path.write_text(json.dumps(report,indent=2)+'\n')
    counts={len(report['positions'][n]) for n in transformers};assert len(counts)==1
    done=next(iter(counts))
    for name in transformers:assert [r['id'] for r in report['positions'][name]]==[r['id'] for r in rows[:done]]
    for index,row in enumerate(rows[done:],done):
        legal=row['legal']
        with torch.no_grad():features=torch.cat([base.forward_features(encode_state_actions(row['fen'],legal[i:i+8])) for i in range(0,len(legal),8)])
        for name,model in transformers.items():
            with torch.no_grad():scores=torch.cat([expected_values(model.head(batch)) for batch in features.split(8)]).tolist()
            report['positions'][name].append({'id':row['id'],**policy_metrics(scores,row,.05)})
        if (index+1)%10==0:save();print('Final positions',index+1,flush=True)
    save()
    for name,record in records.items():
        if name in transformers or report['positions'][name]:continue
        scores=json.loads(subprocess.check_output(['node','tools/v8-score-sparse.mjs'],input=json.dumps({'model':record,'rows':rows}),text=True,cwd=ROOT))
        report['positions'][name]=[{'id':row['id'],**policy_metrics(s,row,4.)} for s,row in zip(scores,rows,strict=True)];save()
    report['positionSummary']={}
    for name,answers in report['positions'].items():
        assert len(answers)==len(rows) and [a['id'] for a in answers]==[r['id'] for r in rows]
        for row,answer in zip(rows,answers,strict=True):assert answer['move'] in row['legal']
        report['positionSummary'][name]={'count':len(rows),'hits':sum(a['hit'] for a in answers),'top4':sum(a['top4'] for a in answers),'crossEntropy':sum(a['crossEntropy'] for a in answers)/len(rows)}
    save();print(json.dumps(report['positionSummary']),flush=True)
    starts=[g['group'] for g in protocol['games'] if g['split']=='test'][:2];assert len(starts)==2
    engine_path=ROOT/'.cache/engines/root/usr/games/stockfish'
    bridge=subprocess.Popen(['node','tools/v8-score-sparse.mjs','--serve'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1)
    try:
        for opening in starts:
            for color in [chess.WHITE,chess.BLACK]:
                for name,record in records.items():
                    key=f'{opening}/{color}/{name}'
                    if any(g['key']==key for g in report['games']):continue
                    engine=chess.engine.SimpleEngine.popen_uci(str(engine_path),timeout=30)
                    engine.configure({'Threads':1,'Hash':16});board=chess.Board();game=chess.pgn.Game();node=game;decisions=[]
                    opponent_name=engine.id.get('name','Stockfish')+' depth3'
                    game.headers['White']=name if color else opponent_name;game.headers['Black']=opponent_name if color else name
                    try:
                        for san in opening.split():move=board.parse_san(san);board.push(move);node=node.add_variation(move)
                        while not board.is_game_over(claim_draw=True) and board.ply()<160:
                            if board.turn==color:
                                if name in transformers:move=chess.Move.from_uci(rank_legal(transformers[name],board,batch_size=8)[0]['move'])
                                else:
                                    bridge.stdin.write(json.dumps({'model':record,'fen':board.fen()})+'\n');bridge.stdin.flush()
                                    if not select.select([bridge.stdout],[],[],60)[0]:raise TimeoutError('Sparse policy bridge timeout')
                                    answer=json.loads(bridge.stdout.readline());move=chess.Move.from_uci(answer['move'])
                                decisions.append({'ply':board.ply()+1,'fen':board.fen(),'move':move.uci()})
                            else:move=engine.play(board,chess.engine.Limit(depth=3)).move
                            assert move in board.legal_moves;board.push(move);node=node.add_variation(move)
                        outcome=board.outcome(claim_draw=True);result=outcome.result() if outcome else '*';termination=outcome.termination.name.lower() if outcome else 'ply-cap'
                        game.headers['Result']=result;game.headers['Termination']=termination
                        report['games'].append({'key':key,'model':name,'color':'w' if color else 'b','result':result,'termination':termination,'plies':board.ply(),'opponent':dict(engine.id),'engineSHA256':sha(engine_path),'depth':3,'book':False,'decisions':decisions,'pgn':str(game)});save();print(json.dumps({'game':key,'result':result,'termination':termination}),flush=True)
                    finally:close_engines(engine)
    finally:
        if bridge.stdin:bridge.stdin.close()
        try:bridge.wait(timeout=5)
        except subprocess.TimeoutExpired:bridge.kill();bridge.wait(timeout=5)
    report['gameSummary']={name:summarize_games([g for g in report['games'] if g['model']==name]) for name in records}
    assert all(g['games']==4 for g in report['gameSummary'].values())
    report['promotion']={}
    for family,entry in frozen['selected'].items():
        if entry['winner']['id']=='control':report['promotion'][family]={'promote':False,'reason':'Control won fresh validation'};continue
        base_id=family+'-control';new_id=family+'-candidate';b=report['gameSummary'][base_id];n=report['gameSummary'][new_id]
        positional=report['positionSummary'][new_id]['hits']>=report['positionSummary'][base_id]['hits']
        matches=n['unresolved']==b['unresolved']==0 and 2*n['wins']+n['draws']>=2*b['wins']+b['draws'] and n['losses']<=b['losses']
        report['promotion'][family]={'promote':positional and matches,'heldoutNonRegression':positional,'pairedGamesNonRegression':matches,'reason':'Validation gain plus non-regression gates; not Elo evidence' if positional and matches else 'Final non-regression gate failed or paired result unresolved'}
    for record in records.values():assert sha(ROOT/record['file'])==record['sha256']
    for p,digest in frozen['sourceHashes'].items():assert sha(ROOT/p)==digest,p
    assert sha(Path(__file__))==evaluator_sha
    report['finishedAt']=time.time();save();(out/'matches.pgn').write_text('\n\n'.join(g['pgn'] for g in report['games'])+'\n')
    print(json.dumps({'complete':True,'positions':report['positionSummary'],'games':report['gameSummary'],'promotion':report['promotion']}),flush=True)
if __name__=='__main__':main()
