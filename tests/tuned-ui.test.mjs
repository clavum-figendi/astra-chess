import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('UI keeps fitted models available and links factual evidence without repeated playing disclaimers',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['pocket-tuned','atlas-tuned'])assert.ok(html.includes(`value="${id}"`));
 assert.match(html,/value="pocket" selected/);
 assert.match(html,/href="\.\/docs\/OPTIMIZATION-V3\.md"/);assert.match(html,/href="\.\/evaluation\/v0\.3\/engine-results\.json"/);
 assert.ok(!html.includes('Sol-assisted'));assert.ok(!html.includes('experimental-note'));assert.ok(!html.includes('no established Elo'));
 assert.ok(!html.includes('all four policies'));
});
