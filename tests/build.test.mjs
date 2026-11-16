import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite } from '../tools/build.mjs';

test('build produces standalone browser and laptop ESM trees and binaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'astra-build-'));
  try {
    for (const dir of ['public/models','src','laptop','docs','evaluation','node_modules/chess.js/dist/esm']) await mkdir(join(root,dir), {recursive:true});
    await writeFile(join(root,'evaluation/results.json'),'{"protocol":"test"}');
    for (const [file,text] of Object.entries({'public/index.html':'<h1>Chess</h1>','public/models/pocket.bin':'POCKET','public/models/atlas.bin':'ATLAS','src/chess.mjs':"export {Chess} from 'chess.js'",'src/network.mjs':'export const x=1;','laptop/cli.mjs':'console.log(1)','node_modules/chess.js/dist/esm/chess.js':'export class Chess {}','node_modules/chess.js/LICENSE':'BSD-2-Clause','README.md':'Readme','LICENSE':'MIT','docs/ARCHITECTURE.md':'Architecture'})) await writeFile(join(root,file),text);
    await buildSite(root);
    assert.equal(await readFile(join(root,'dist/src/chess.mjs'),'utf8'), 'export class Chess {}');
    assert.equal(await readFile(join(root,'build/laptop/models/atlas.bin'),'utf8'), 'ATLAS');
    assert.equal(await readFile(join(root,'dist/index.html'),'utf8'), '<h1>Chess</h1>');
    assert.equal(await readFile(join(root,'dist/.nojekyll'),'utf8'), '');
    assert.equal(JSON.parse(await readFile(join(root,'dist/evaluation/results.json'),'utf8')).protocol, 'test');
    assert.equal(JSON.parse(await readFile(join(root,'build/laptop/evaluation/results.json'),'utf8')).protocol, 'test');
    assert.equal((await readFile(join(root,'dist/downloads/astra-chess-laptop.zip'))).subarray(0,2).toString(), 'PK');
  } finally { await rm(root,{recursive:true,force:true}); }
});
