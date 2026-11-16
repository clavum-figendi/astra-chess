import test from 'node:test';import assert from 'node:assert/strict';
import {resolveModel} from '../laptop/model-selection.mjs';
test('packaged family aliases resolve only to listed artifacts',()=>{
 const list=[{id:'pocket-plus',file:'pocket-plus.bin'},{id:'atlas',file:'atlas.bin'}];
 assert.equal(resolveModel(list,'pocket').id,'pocket-plus');assert.equal(resolveModel(list,'atlas').file,'atlas.bin');
 assert.throws(()=>resolveModel(list,'pocket-policy'),/Unknown/);
 assert.throws(()=>resolveModel([{id:'pocket',file:'../bad.bin'}],'pocket'),/artifact/);
 assert.equal(resolveModel([...list,{id:'pocket',file:'pocket.bin'}],'pocket').file,'pocket.bin');
});
