import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileBook } from '../src/opening-book.mjs';

const ROOT=new URL('../',import.meta.url);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildGameBook(games) {
  const paths=new Map();
  const ids=new Set();
  for(const game of games) {
    if(!game.id || ids.has(game.id)) throw new Error('Duplicate or missing game ID');
    ids.add(game.id);
    const existing=paths.get(game.moves);
    if(existing) existing.weight++;
    else paths.set(game.moves,{moves:game.moves,weight:1});
  }
  // Validate all retained raw SAN, even though the runtime snapshot stops at 12 plies.
  compileBook([...paths.values()],{maxPlies:1});
  const compact=new Map();
  for(const line of paths.values()) {
    const moves=line.moves.split(' ').slice(0,12).join(' ');
    const old=compact.get(moves);
    if(old) old.weight+=line.weight;
    else compact.set(moves,{moves,weight:line.weight});
  }
  const book=compileBook([...compact.values()],{maxPlies:12});
  const entries=Object.values(book.positions).flat();
  const text=JSON.stringify(book)+'\n';
  const stats={games:games.length,uniquePaths:compact.size,rawUniquePaths:paths.size,maxPlies:12,
    positions:Object.keys(book.positions).length,continuations:entries.length,
    totalStoredLinePlies:book.lines.reduce((n,l)=>n+l.moves.split(' ').length,0),
    artifactBytes:Buffer.byteLength(text),artifactSha256:sha256(text)};
  return {book,text,stats};
}

export function buildSnapshots({write=false}={}) {
  const raw=readFileSync(new URL('data/book-sources/selected-games.ndjson',ROOT));
  const receipt=JSON.parse(readFileSync(new URL('data/book-sources/SOURCE.json',ROOT)));
  if(sha256(raw)!==receipt.selectedSha256) throw new Error('Selected source checksum mismatch');
  for(const [file,digest] of Object.entries(receipt.evidenceSha256)) {
    if(sha256(readFileSync(new URL(file,ROOT)))!==digest) throw new Error(`Evidence checksum mismatch: ${file}`);
  }
  const games=raw.toString().trim().split('\n').map(l=>JSON.parse(l));
  if(games.some(g=>g.whiteElo<2200 || g.blackElo<2200 || !['blitz','rapid','classical'].includes(g.speed) || g.moves.split(' ').length>24)) throw new Error('Invalid selected source');
  const defs=[{id:'lichess-2200',name:'Lichess 2200+ · blitz / rapid / classical',games},
    {id:'lichess-2200-slow',name:'Lichess 2200+ · rapid / classical',games:games.filter(g=>g.speed!=='blitz')}];
  const eco=readFileSync(new URL('public/openings.json',ROOT));
  const manifest={version:1,default:'eco',books:[{id:'eco',name:'ECO repertoire',file:'../openings.json',sha256:sha256(eco),rights:'CC0-1.0',sourceUrl:'https://github.com/lichess-org/chess-openings',weighting:'One vote per maximal named SAN path; not game frequency.',description:'Original ECO repertoire; unchanged default.'}],
    unavailable:[{id:'masters',name:'Masters',available:false,reason:'Anonymous explorer access returned HTTP 401. No credentials used; redistribution rights for a Masters snapshot were not established.'}]};
  const stats={}; const artifacts={};
  for(const def of defs) {
    if(!def.games.length) throw new Error(`Empty profile: ${def.id}`);
    const built=buildGameBook(def.games); stats[def.id]=built.stats; artifacts[`${def.id}.json`]=built.text;
    manifest.books.push({id:def.id,name:def.name,file:`${def.id}.json`,sha256:built.stats.artifactSha256,
      rights:'CC0-1.0',licenseFile:'CC0-1.0.txt',sourceUrl:receipt.sourceUrl,
      weighting:'One vote per sampled game at each recorded ply; duplicate SAN paths have summed game weights. Not full-database popularity or neural confidence.',
      description:`${def.games.length} actual games from the same bounded September 2026 export sample, both players rated 2200+. First 12 plies; ${def.id.endsWith('slow')?'rapid/classical subset only':'blitz, rapid and classical; no bullet/ultrabullet'}.`,
      games:def.games.length,positions:built.stats.positions,maxPlies:12,corpus:'lichess-2026-09-prefix-100000000',sourceSha256:receipt.selectedSha256});
  }
  if(write) {
    mkdirSync(new URL('public/books/',ROOT),{recursive:true});
    writeFileSync(new URL('public/books/CC0-1.0.txt',ROOT),readFileSync(new URL('data/book-sources/evidence/cc0-1.0-legalcode.txt',ROOT)));
    for(const [file,text] of Object.entries(artifacts)) writeFileSync(new URL(`public/books/${file}`,ROOT),text);
    writeFileSync(new URL('public/books/manifest.json',ROOT),JSON.stringify(manifest,null,2)+'\n');
    writeFileSync(new URL('data/book-sources/STATS.json',ROOT),JSON.stringify(stats,null,2)+'\n');
  }
  return {manifest,stats,artifacts};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildSnapshots({write:true}).stats,null,2));
