#!/usr/bin/env python3
"""Bounded incremental extraction; zstd prefix EOF is expected, never a PGN game boundary."""
import collections
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEEDS={'Rated Blitz game':'blitz','Rated Rapid game':'rapid','Rated Classical game':'classical'}
RESULTS={'1-0','0-1','1/2-1/2'}

def select_game(tags, movetext):
    if tags.get('Event') not in SPEEDS or tags.get('SetUp') or tags.get('FEN'):
        return None
    if not all(tags.get(k,'').isdigit() and int(tags[k])>=2200 for k in ['WhiteElo','BlackElo']):
        return None
    if not re.fullmatch(r'https://lichess.org/[A-Za-z0-9]{8}',tags.get('Site','')):
        return None
    if tags.get('Result') not in RESULTS:
        return None
    text=re.sub(r'\{[^}]*\}', ' ', movetext)
    if any(c in text for c in '{}();'):
        return None
    tokens=re.sub(r'\d+\.(?:\.\.)?', ' ', text).split()
    tokens=[t for t in tokens if not t.startswith('$')]
    if not tokens or tokens[-1]!=tags['Result']:
        return None
    moves=[re.sub(r'[!?]+$','',t) for t in tokens[:-1]][:24]
    if not moves or any(not re.fullmatch(r'[a-zA-Z0-9=+#-]+',t) for t in moves):
        return None
    return {'id':tags['Site'].rsplit('/',1)[1], 'whiteElo':int(tags['WhiteElo']),
            'blackElo':int(tags['BlackElo']), 'speed':SPEEDS[tags['Event']],
            'timeControl':tags.get('TimeControl'), 'date':tags.get('UTCDate'),
            'time':tags.get('UTCTime'), 'moves':' '.join(moves)}

def extract(prefix, output, limit=3000):
    if not 1 <= limit <= 3000:
        raise ValueError('Selection limit must be 1..3000')
    digest=hashlib.sha256()
    with open(prefix,'rb') as f:
        for chunk in iter(lambda:f.read(65536),b''): digest.update(chunk)
    proc=subprocess.Popen(['zstd','-dc','--memory=64MB',str(prefix)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    tags={}; moves=[]; stats=collections.Counter(); speeds=collections.Counter(); selected=[]; seen=set()
    def finish():
        if not tags or not moves: return
        stats['encounteredGameRecords']+=1
        movetext=' '.join(moves)
        if tags.get('Result') in RESULTS and movetext.rstrip().endswith(tags['Result']):
            stats['completedResultRecords']+=1
        else:
            stats['incompleteOrUnfinishedRecords']+=1
        game=select_game(tags,movetext)
        if game:
            stats['qualifyingGames']+=1
            if game['id'] in seen:
                stats['duplicateIds']+=1
            elif len(selected)<limit:
                seen.add(game['id']); selected.append(game); speeds[game['speed']]+=1
    assert proc.stdout is not None
    # Export has one physical movetext line; memory remains bounded by one game.
    for line in proc.stdout:
        if line.startswith('[Event '):
            finish(); tags={}; moves=[]
        if line.startswith('['):
            match=re.fullmatch(r'\[(\w+) "(.*)"\]\s*',line)
            if match: tags[match[1]]=match[2]
        elif line.strip():
            moves.append(line.strip())
            if sum(map(len,moves))>1_000_000: raise ValueError('Oversized PGN game')
    # The last game is accepted only if its result is complete; no implicit EOF completion.
    finish()
    assert proc.stderr is not None
    stderr=proc.stderr.read(); code=proc.wait()
    if code not in (0,1) or (code and 'premature end' not in stderr.lower()):
        raise RuntimeError(f'zstd failed ({code}): {stderr}')
    output=pathlib.Path(output); output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(''.join(json.dumps(g,separators=(',',':'))+'\n' for g in selected))
    meta={'prefixBytes':pathlib.Path(prefix).stat().st_size,'prefixSha256':digest.hexdigest(),
          'selection':f'First {limit} distinct qualifying complete games in decoded prefix; both ratings >=2200; rated blitz/rapid/classical only; first <=24 SAN plies retained.',
          **stats,'selectedGames':len(selected),'selectedBySpeed':dict(speeds),'zstdExitCode':code,
          'zstdStderr':stderr.strip(),'selectedSha256':hashlib.sha256(output.read_bytes()).hexdigest()}
    output.with_suffix('.meta.json').write_text(json.dumps(meta,indent=2)+'\n')
    print(json.dumps(meta,indent=2))

if __name__=='__main__':
    extract(sys.argv[1],sys.argv[2],int(sys.argv[3]) if len(sys.argv)>3 else 3000)
