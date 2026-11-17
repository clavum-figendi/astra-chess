import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from '../src/chess.mjs';

class Node {
  constructor(tag='div') {this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.value='';this.checked=false;this.textContent='';this.classList={toggle(){}};}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.children=[...nodes];}
  addEventListener(type,fn) {(this.listeners[type] ||= []).push(fn);}
  dispatch(type) {for(const fn of this.listeners[type]||[]) fn({target:this,preventDefault(){}});this['on'+type]?.({target:this,preventDefault(){}});}
  setAttribute() {} close() {this.open=false;} showModal(){this.open=true;} click(){this.onclick?.();}
  get selectedOptions() {return this.children.filter(c=>c.value===this.value);}
}
const settle=()=>new Promise(r=>setTimeout(r,0));
test('UI captures book/seed/SHA per game, cancels pending profile replies and exports actual PGN provenance',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/id="book-source"/);
  assert.ok(html.indexOf('id="book-source"')>html.indexOf('id="book"'));
  assert.doesNotMatch(html,/<details id="technical-panel"[^>]*\bopen\b/);
  const root=await mkdtemp(join(process.env.TMPDIR || '/home/hermes/.hermes/cache/scratch','v8-book-app-'));
  const saved=new Map(['document','window','Worker','fetch','setInterval','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  try {
    await mkdir(join(root,'src'),{recursive:true});
    await cp(new URL('../public/app.mjs',import.meta.url),join(root,'app.mjs'));
    for(const f of ['clock.mjs','premove.mjs','sound.mjs','model-resource.mjs']) await cp(new URL('../src/'+f,import.meta.url),join(root,'src',f));
    await cp(new URL('../node_modules/chess.js/dist/esm/chess.js',import.meta.url),join(root,'src/chess.mjs'));
    const nodes=new Map(); const $=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
    for(const [id,value] of Object.entries({model:'pocket',color:'b','time-control':'unlimited','book-source':'eco'})) $(id).value=value;
    $('book').checked=true; $('premove').checked=true;
    globalThis.document={getElementById:$,createElement:tag=>new Node(tag),addEventListener(){}};
    globalThis.window={addEventListener(){}};globalThis.setInterval=()=>0;
    globalThis.localStorage={getItem:()=> 'on',setItem(){}};
    const hash='a'.repeat(64), workers=[], requests=[];
    globalThis.fetch=async url=>new Response(JSON.stringify(new URL(url).pathname.endsWith('/books/manifest.json')?{version:1,default:'eco',books:[{id:'eco',name:'ECO repertoire',file:'../openings.json',sha256:'b'.repeat(64)},{id:'snapshot',name:'Offline snapshot',file:'snapshot.json',sha256:hash}]}:{models:[{id:'pocket',name:'Pocket',file:'pocket.bin'}]}));
    globalThis.Worker=class {
      constructor(){workers.push(this);} terminate(){this.terminated=true;}
      postMessage(d){requests.push(d);if(d.type==='load')queueMicrotask(()=>this.onmessage({data:{type:'loaded',id:d.id,modelId:d.modelId,bookSource:d.book.source,bookSHA256:d.book.source==='snapshot'?hash:'b'.repeat(64)}}));else this.pending=d;}
      reply(){this.onmessage({data:{type:'move',id:this.pending.id,move:'d2d4',source:'book',bookSource:'snapshot',candidates:[{move:'d2d4',weight:3}],elapsedMs:1}});}
    };
    let blob; URL.createObjectURL=value=>{blob=value;return 'blob:test';};URL.revokeObjectURL=()=>{};
    await import(pathToFileURL(join(root,'app.mjs')).href);await settle();
    assert.equal($('book-source').value,'eco'); assert.equal($('book-source').children.length,2); assert.equal($('sound').checked,true);
    $('new-game').click();await settle();assert.ok(workers[0].pending);
    const oldSeed=requests[0].book.seed;
    $('book-source').value='snapshot';$('book-source').dispatch('change');
    assert.equal(workers[0].terminated,true); workers[0].reply();await settle();
    assert.equal($('moves').children[0].textContent,'The first move is yours.');
    $('new-game').click();await settle();
    const load=requests.findLast(r=>r.type==='load');assert.equal(load.book.source,'snapshot');assert.notEqual(load.book.seed,oldSeed);
    workers[1].reply();await settle();assert.equal($('move-source').textContent,'book');assert.equal($('score-label').textContent,'Weight');
    $('download-pgn').click();const pgn=await blob.text();
    const imported=new Chess();imported.loadPgn(pgn);assert.deepEqual(imported.history(),['d4']);
    assert.match(pgn,/\[BookSource "snapshot"\]/); assert.match(pgn,new RegExp(`\\[BookHash "${hash}"\\]`));assert.match(pgn,/\[BookHashAlgorithm "SHA256"\]/);assert.ok(pgn.includes(`[Seed "${load.book.seed}"]`));assert.match(pgn,/1\. d4/);
  } finally {
    URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;
    for(const [key,descriptor] of saved) {if(descriptor===undefined)delete globalThis[key];else Object.defineProperty(globalThis,key,descriptor);}
    await rm(root,{recursive:true,force:true});
  }
});
