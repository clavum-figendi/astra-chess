import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('UI removes obsolete variant choices and keeps evidence inside technical disclosure',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['pocket-tuned','atlas-tuned','pocket-policy','atlas-policy'])assert.ok(!html.includes(`value="${id}"`));
 const active=JSON.parse(readFileSync(new URL('../public/models/active.json',import.meta.url),'utf8')).sparse;
 assert.equal(active.filter(m=>m.id.startsWith('pocket')).length,1);assert.equal(active.filter(m=>m.id.startsWith('atlas')).length,1);
 assert.match(html,/value="pocket" selected/);
 assert.match(html,/<details id="technical-panel">/);assert.match(html,/href="\.\/docs\/BROWSER-V6\.md"/);assert.match(html,/href="\.\/evaluation\/v0\.6\/heldout-onnx\.json"/);
 assert.ok(!html.includes('Sol-assisted'));assert.ok(!html.includes('experimental-note'));assert.ok(!html.includes('no established Elo'));
 assert.ok(!html.includes('all four policies'));
});
