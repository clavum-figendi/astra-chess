"""Retrieve a predeclared benchmark sample; never consumed by the compiler."""
import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parent.parent
url = 'https://storage.googleapis.com/searchless_chess/data/puzzles.csv'
with urllib.request.urlopen(url, timeout=60) as response:
    raw = response.read(8_000_000)
rows = list(csv.DictReader(io.StringIO(raw.decode())))
assert len(rows) >= 256, 'Incomplete puzzle dataset'
# Fixed ID hashing avoids cherry-picking particular themes or rating bands.
rows.sort(key=lambda row: hashlib.sha256(('astra-chess-eval-v1:' + row['PuzzleId']).encode()).hexdigest())
sample = [dict(id=row['PuzzleId'], fen=row['FEN'], moves=row['Moves'].split(), rating=int(row['Rating'])) for row in rows[:256]]
record = dict(source=url, source_sha256=hashlib.sha256(raw).hexdigest(), source_count=len(rows), selection='lowest SHA256(astra-chess-eval-v1: + PuzzleId), 256 records', puzzles=sample)
path = root / '.cache/puzzles.json'
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps({k:v for k,v in record.items() if k!='puzzles'}, indent=2))
print('Selected', len(sample), 'records; saved', path)
