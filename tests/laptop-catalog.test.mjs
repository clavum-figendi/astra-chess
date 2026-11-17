import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Chess} from '../src/chess.mjs';
const fen=new Chess().fen();
test('laptop runner exposes and executes every installed model including larger variants',()=>{
  const list=spawnSync('node',['laptop/cli.mjs','--list-models'],{encoding:'utf8',input:'',timeout:30000});
  assert.equal(list.status,0,list.stderr);const catalogue=JSON.parse(list.stdout);
  assert.deepEqual(catalogue.models.map(m=>m.id),['atlas-v8','pocket','pocket-plus','pocket-tuned','pocket-policy','atlas','atlas-plus','atlas-tuned','atlas-policy']);
  assert.ok(catalogue.proposals.every(p=>p.status==='proposal-not-built'));
  for(const {id} of catalogue.models){
    const run=spawnSync('node',['laptop/cli.mjs','--model',id,'--no-book','--fen',fen],{encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stderr);
    assert.doesNotThrow(()=>new Chess(fen).move(JSON.parse(run.stdout).move));
  }
});
