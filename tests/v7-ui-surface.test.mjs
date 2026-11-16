import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('technical details are collapsed and premove and audio have explicit accessible controls', () => {
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<details id="technical-panel"[^>]*>/);
 assert.doesNotMatch(html,/<details id="technical-panel"[^>]*\bopen\b/);
 for(const id of ['premove','cancel-premove','sound']) assert.ok(html.includes(`id="${id}"`),id);
 assert.ok(html.indexOf('id="technical-panel"') < html.indexOf('id="latency"'));
});

test('sound is silent by default, persists only explicit preference and immediately stops active voices', async () => {
 const module=await import('../src/sound.mjs').catch(()=>null); assert.ok(module,'sound module must exist');
 let saved=null;let stops=0;
 const storage={getItem:()=>saved,setItem:(_,v)=>{saved=v;}};
 const ctx={state:'running',currentTime:0,destination:{},createOscillator:()=>({frequency:{setValueAtTime(){}},connect(){},start(){},stop(){stops++;}}),createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};
 const sound=module.createSound({storage,makeContext:()=>ctx});
 assert.equal(sound.enabled,false); sound.play('move');assert.equal(stops,0);
 await sound.setEnabled(true);sound.play('move');assert.equal(saved,'on');
 const before=stops;await sound.setEnabled(false);assert.ok(stops>before);assert.equal(saved,'off');
 assert.doesNotThrow(()=>module.createSound({storage:{getItem(){throw Error('denied')}}}));
});
