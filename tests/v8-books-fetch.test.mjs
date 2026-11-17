import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as fetcher from '../tools/v8-books-fetch.mjs';

test('bounded fetch streams exact response and rejects ignored ranges, overflow and truncation',async()=>{
  assert.equal(typeof fetcher.savePrefixResponse,'function');
  const dir=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'v8-book-fetch-'));
  try {
    const file=join(dir,'prefix.part');
    const response=(body,status=206,range='bytes 0-3/100')=>new Response(body,{status,headers:{'Content-Range':range}});
    const result=await fetcher.savePrefixResponse(response('test'),{file,bytes:4});
    assert.equal(result.bytes,4); assert.equal(readFileSync(file,'utf8'),'test');
    assert.match(result.sha256,/^[a-f0-9]{64}$/);
    for(const r of [response('test',200),response('test',206,'bytes 4-7/100'),response('testing'),response('tes')]) {
      const bad=join(dir,'bad.part');
      await assert.rejects(()=>fetcher.savePrefixResponse(r,{file:bad,bytes:4}));
      assert.equal(existsSync(bad),false);
      assert.equal(existsSync(bad+'.download'),false);
    }
    await assert.rejects(()=>fetcher.fetchDumpPrefix({month:'2026-09',bytes:1200000000}));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('exclusive-create collision preserves existing partial and completed archive',async()=>{
  const dir=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'v8-book-collision-'));
  try {
    const file=join(dir,'prefix.part');
    writeFileSync(file,'previous archive');
    writeFileSync(file+'.download','other acquisition sentinel');
    await assert.rejects(fetcher.savePrefixResponse(new Response('test',{
      status:206,headers:{'Content-Range':'bytes 0-3/100'}
    }),{file,bytes:4}),{code:'EEXIST'});
    assert.equal(existsSync(file+'.download'),true);
    assert.equal(readFileSync(file+'.download','utf8'),'other acquisition sentinel');
    assert.equal(readFileSync(file,'utf8'),'previous archive');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('overlapping acquisition cannot unlink the active first writer partial',async()=>{
  const dir=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'v8-book-overlap-'));
  const file=join(dir,'prefix.part');
  let controller;
  const body=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('te'));}});
  const response=body=>new Response(body,{status:206,headers:{'Content-Range':'bytes 0-3/100'}});
  const first=fetcher.savePrefixResponse(response(body),{file,bytes:4});
  // Attach immediately so a regression cannot produce an unhandled rejection.
  first.catch(()=>{});
  let released=false;
  try {
    const deadline=performance.now()+5000;
    while(!existsSync(file+'.download') || readFileSync(file+'.download','utf8')!=='te') {
      assert.ok(performance.now()<deadline,'first acquisition must write before collision');
      await nextTurn();
    }
    await assert.rejects(fetcher.savePrefixResponse(response('next'),{file,bytes:4}),{code:'EEXIST'});
    assert.equal(existsSync(file+'.download'),true);
    assert.equal(readFileSync(file+'.download','utf8'),'te');
    controller.enqueue(new TextEncoder().encode('st'));controller.close();released=true;
    const result=await first;
    assert.equal(result.bytes,4);
    assert.equal(readFileSync(file,'utf8'),'test');
    assert.equal(existsSync(file+'.download'),false);
  } finally {
    if(!released) {try {controller.enqueue(new TextEncoder().encode('st'));controller.close();} catch {}}
    await first.catch(()=>{});
    rmSync(dir,{recursive:true,force:true});
  }
});
