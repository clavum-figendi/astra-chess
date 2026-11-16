import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Chess } from '../src/chess.mjs';
const run=(args,input)=>spawnSync(process.execPath,['laptop/cli.mjs','--model','pocket',...args],{cwd:new URL('../',import.meta.url),encoding:'utf8',input,timeout:30000});
test('CLI defaults to book, seed reproduces, and no-book selects actual policy',()=>{
 const args=['--fen',new Chess().fen(),'--seed','replay'];
 const a=run(args),b=run(args); assert.equal(a.status,0,a.stderr);
 const first=JSON.parse(a.stdout),second=JSON.parse(b.stdout);
 assert.equal(first.source,'book'); assert.equal(first.move,second.move);
 assert.equal(first.seed,'replay'); assert.ok(first.candidates.every(x=>!('score' in x)));
 const policy=run([...args,'--no-book']);assert.equal(policy.status,0,policy.stderr);
 assert.equal(JSON.parse(policy.stdout).source,'policy');
 const late=run(['--fen',new Chess().fen().replace('0 1','0 20')]);
 assert.equal(JSON.parse(late.stdout).source,'policy');
});
test('UCI reports neutral identity and honest source; repetition never selects book',()=>{
 const result=run(['--book','--seed','uci'],'uci\nisready\nposition startpos\ngo\nposition startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8\ngo\nquit\n');
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/id name Chess Lab/);assert.doesNotMatch(result.stdout,/Astra|Sol/);
 assert.match(result.stdout,/info string source book/);assert.match(result.stdout,/bestmove 0000/);
 const imported=run(['--seed','uci'],'position fen '+new Chess().fen().replace(' - ',' e6 ')+'\ngo\nquit\n');
 assert.match(imported.stdout,/info string source policy/);

});
