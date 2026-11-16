import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('UI exposes experimental fitted policies without promoting defaults or implying training-free provenance',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['pocket-tuned','atlas-tuned'])assert.ok(html.includes(`value="${id}"`));
 assert.match(html,/value="pocket" selected/);assert.match(html,/offline engine-guided fitting/);assert.match(html,/109 losses/);assert.match(html,/10.*cutoff/);
 assert.ok(!html.includes('all four policies'));
});
