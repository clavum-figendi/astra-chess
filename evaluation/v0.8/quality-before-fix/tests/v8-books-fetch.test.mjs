import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
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
    }
    await assert.rejects(()=>fetcher.fetchDumpPrefix({month:'2026-09',bytes:1200000000}));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
