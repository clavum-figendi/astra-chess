import test from 'node:test';
import assert from 'node:assert/strict';
import { modelResourceURL, verifyModelBuffer } from '../src/model-resource.mjs';
const base=new URL('https://example.org/renamed/models/');
test('model resources accept only local artifacts matching the runtime',()=>{
 assert.equal(modelResourceURL({file:'deepmind-9m.onnx',runtime:'onnx'},base).pathname,'/renamed/models/deepmind-9m.onnx');
 assert.equal(modelResourceURL({file:'pocket.bin'},base).pathname,'/renamed/models/pocket.bin');
 for(const file of ['../other.onnx','https://evil.test/x.onnx','bad.bin','x.onnx?x=1'])assert.throws(()=>modelResourceURL({file,runtime:'onnx'},base));
 assert.throws(()=>modelResourceURL({file:'x.onnx',runtime:'unknown'},base));
});
test('artifact integrity requires correct size and digest',async()=>{
 const buffer=new Uint8Array([1,2,3]).buffer;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
 await verifyModelBuffer(buffer,{bytes:3,sha256:hash});
 await assert.rejects(verifyModelBuffer(buffer,{bytes:4,sha256:hash}));
 await assert.rejects(verifyModelBuffer(buffer,{bytes:3,sha256:'0'.repeat(64)}));
 await assert.rejects(verifyModelBuffer(buffer,{bytes:3}));
});
