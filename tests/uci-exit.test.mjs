import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
for(const keepOpen of [false,true])test(`UCI quit exits with stdin ${keepOpen?'still open':'closed'}`,async()=>{
 const child=spawn(process.execPath,['laptop/cli.mjs','--model','pocket','--no-book'],{stdio:['pipe','pipe','pipe']});let stdout='';child.stdout.on('data',b=>stdout+=b);child.stderr.resume();
 const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('quit did not terminate the engine'));},4000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});});
 child.stdin.write('uci\nisready\nquit\n');if(!keepOpen)child.stdin.end();
 const r=await result;assert.equal(r.code,0);assert.equal(r.signal,null);assert.match(stdout,/uciok/);assert.match(stdout,/readyok/);
});
