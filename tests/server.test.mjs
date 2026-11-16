import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from '../tools/serve.mjs';

test('static server serves modules, 404 and confines paths to its root', async () => {
  const root = await mkdtemp(join(tmpdir(),'astra-http-'));
  await writeFile(join(root,'index.html'),'<h1>Astra</h1>');
  await writeFile(join(root,'app.mjs'),'export const a=1;');
  const server = await serve(root,0);
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(url)).text(),'<h1>Astra</h1>');
    assert.match((await fetch(url+'/app.mjs')).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(url+'/absent')).status,404);
    assert.equal((await fetch(url+'/%2e%2e%2fpackage.json')).status,403);
  } finally { await new Promise(r=>server.close(r)); await rm(root,{recursive:true,force:true}); }
});
