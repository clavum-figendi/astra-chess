// Isolated sentinel fixtures only; no real decisions or public weights are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=path.resolve('tools/rebuild-v8-models.mjs');
function snapshot(dir){
 const entries={};
 function visit(relative=''){
  for(const entry of fs.readdirSync(path.join(dir,relative),{withFileTypes:true})){
   const name=path.join(relative,entry.name);
   entries[name]=entry.isDirectory()?'directory':fs.readFileSync(path.join(dir,name)).toString('hex');
   if(entry.isDirectory())visit(name);
  }
 }
 visit();return entries;
}
for(const [name,decision] of [
 ['absent',undefined],
 ['malformed','{not valid JSON'],
 ['approved',JSON.stringify({approved:true,evidenceSHA256:{},derivatives:{pocket:{candidate:'enemy-relaxed',sha256:'a'.repeat(64),changedScalars:1},atlas:{candidate:'enemy-relaxed',sha256:'b'.repeat(64),changedScalars:1}}})],
])test(`CLI is read-only with ${name} decision, regardless of arguments`,()=>{
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'v8-readonly-cli-'));
 try{
  const put=(p,bytes)=>{const file=path.join(dir,p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
  put('public/models/manifest.json','MANIFEST SENTINEL: not JSON');
  for(const model of ['pocket-plus','atlas','pocket-v8','atlas-v8'])put(`public/models/${model}.bin`,Buffer.from(`BINARY SENTINEL ${model}\0`));
  if(decision!==undefined)put('evaluation/v0.8/release-decision.json',decision);
  // Catch even ignored reads, not just parsing or output changes.
  put('deny-fixture-reads.cjs',`const fs=require('node:fs'),path=require('node:path');
const read=fs.readFileSync;fs.readFileSync=function(file,...args){
 if(typeof file==='string'&&path.resolve(file).startsWith(process.cwd()+path.sep))throw new Error('CLI attempted fixture read: '+file);
 return read.call(this,file,...args);
};require('node:module').syncBuiltinESMExports();\n`);
  const before=snapshot(dir);
  for(const args of [[],['--publish','--approved','--decision','evaluation/v0.8/release-decision.json','--output','public/models/atlas-v8.bin'],['--help']]){
   const result=spawnSync(process.execPath,['--require',path.join(dir,'deny-fixture-reads.cjs'),cli,...args],{cwd:dir,encoding:'utf8',env:{...process.env,UV_THREADPOOL_SIZE:'1',OMP_NUM_THREADS:'1'},timeout:10000});
   assert.equal(result.status,0,result.stderr||String(result.error));
   assert.match(result.stdout,/read.only/i);
   assert.match(result.stdout,/no publication|publication (?:is )?disabled/i);
   assert.equal(result.stderr,'');
   assert.deepEqual(snapshot(dir),before,'CLI changed a sentinel/decision or created extra outputs');
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
