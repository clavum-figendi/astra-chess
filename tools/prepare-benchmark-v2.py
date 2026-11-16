"""Disjoint, fixed second sample; no labels are shown to the weight author."""
import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request
root=Path(__file__).resolve().parent.parent
url='https://storage.googleapis.com/searchless_chess/data/puzzles.csv'
with urllib.request.urlopen(url,timeout=60) as response:
    raw=response.read(8_000_000)
assert hashlib.sha256(raw).hexdigest()=='099d54e681a07b9e82b4462aaf5436a6e833edc6f56b92ea7c2d2413f7efbe48', 'Upstream dataset changed'
rows=list(csv.DictReader(io.StringIO(raw.decode())))
rows.sort(key=lambda row:hashlib.sha256(('astra-chess-eval-v1:'+row['PuzzleId']).encode()).hexdigest())
previous={row['PuzzleId'] for row in rows[:256]}
chosen=rows[256:512]
assert len(chosen)==256 and not (previous & {row['PuzzleId'] for row in chosen})
sample=[dict(id=row['PuzzleId'],fen=row['FEN'],moves=row['Moves'].split(),rating=int(row['Rating'])) for row in chosen]
record=dict(source=url,source_sha256=hashlib.sha256(raw).hexdigest(),source_count=len(rows),selection='SHA256(astra-chess-eval-v1: + PuzzleId) sorted positions 257..512; disjoint from v1',puzzles=sample)
out=root/'.cache/puzzles-v2.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'count':len(sample),'overlapWithV1':0,'sampleSHA256':hashlib.sha256(out.read_bytes()).hexdigest()}))
