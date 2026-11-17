import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Release builds are owned by the parent; these source gates deliberately do
// not create dist, laptop archives, or other release outputs.
test('packager copies the offline registry/assets to laptop and gates missing registry to legacy ECO trees',async()=>{
  const source=await readFile(new URL('../tools/build.mjs',import.meta.url),'utf8');
  assert.match(source,/cp\(join\(root,'public\/books'\),join\(laptop,'books'\),\{recursive:true\}\)/);
  assert.match(source,/Opening-book registry is required/);
  assert.match(source,/legacyBook\.version\s*!==\s*1/);
  assert.match(source,/legacyWorker\.includes\('\.\/books\/'\)/);
  assert.match(source,/cp\(join\(root,'src'\),join\(dist,'src'\),\{recursive:true\}\)/);
  assert.match(source,/cp\(join\(dist,'docs'\),join\(laptop,'docs'\),\{recursive:true\}\)/);
});
