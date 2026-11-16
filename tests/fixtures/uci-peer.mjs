#!/usr/bin/env node
// Deliberately artificial protocol peer; never a chess-strength baseline.
import { createInterface } from 'node:readline';
const mode = process.env.UCI_FIXTURE_MODE || 'partial';
createInterface({ input: process.stdin }).on('line', line => {
  if (line === 'uci' && mode === 'nohandshake') return;
  if (line === 'uci') console.log('id name UCI TEST FIXTURE\noption name Threads type spin default 1 min 1 max 1\noption name Hash type spin default 16 min 1 max 32\noption name Ponder type check default false\noption name MultiPV type spin default 1 min 1 max 256\nuciok');
  if (line === 'isready') console.log(mode === 'stale' ? 'bestmove d2d4\nreadyok' : 'readyok');
  if (line === 'quit') process.exit(0);
  if (!line.startsWith('go ')) return;
  if (mode === 'timeout') { process.stderr.write('x'.repeat(30000)); return; }
  if (mode === 'exit') { process.stderr.write('fixture deliberate exit'); process.exit(7); }
  if (mode === 'illegal') { console.log('bestmove a1a8'); return; }
  if (mode === 'null') { console.log('bestmove (none)'); return; }
  const finish = () => {
    if (mode === 'missing') console.log('info depth 4 nodes 45 pv e2e4 e7e5\ninfo string depth 9 score cp 999 pv d2d4\ninfo depth -1 score cp 100 pv d2d4\nbestmove e2e4');
    else console.log('info depth 3 multipv 1 score cp 23 nodes 40 pv e2e4 e7e5\ninfo depth 3 multipv 2 score mate -3 nodes 45 pv d2d4 d7d5\ninfo depth 4 multipv 1 score cp 30 lowerbound nodes 55 pv e2e4 e7e5\nbestmove e2e4');
  };
  if (mode === 'slow') setTimeout(finish, 80); else finish();
});
