#!/usr/bin/env node
// Bounded official CC0 export prefixes only. No explorer APIs or credentials.
// node --max-old-space-size=128 tools/v8-books-fetch.mjs dump --month 2026-09 --bytes 100000000
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const MAX_PREFIX_BYTES=200_000_000;
const validSize=bytes=>Number.isSafeInteger(bytes) && bytes>0 && bytes<=MAX_PREFIX_BYTES;

/** Backpressure plus hard byte cap; partial network transfers never become checkpoints. */
export async function savePrefixResponse(response,{file,bytes}) {
  if(!validSize(bytes)) throw new Error('Prefix must be 1..200000000 bytes');
  const match=/^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
  if(response.status!==206 || !match || Number(match[1])!==bytes-1 || Number(match[2])<bytes || !response.body) {
    await response.body?.cancel();
    throw new Error('Server did not honor the exact bounded Range request');
  }
  const partial=String(file)+'.download';
  let count=0, ownsPartial=false; const hash=createHash('sha256');
  try {
    const output=createWriteStream(partial,{flags:'wx',highWaterMark:65536});
    // Only a successful exclusive open grants cleanup ownership; EEXIST does not.
    output.once('open',()=>{ownsPartial=true;});
    await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,done) {
      count+=chunk.length;
      if(count>bytes) return done(new Error('Response exceeded prefix bound'));
      hash.update(chunk); done(null,chunk);
    }}),output);
    if(count!==bytes) throw new Error(`Truncated prefix: ${count} != ${bytes}`);
    renameSync(partial,file);
    return {bytes:count,sha256:hash.digest('hex'),contentRange:response.headers.get('content-range'),
      lastModified:response.headers.get('last-modified'),etag:response.headers.get('etag')};
  } catch(error) { if(ownsPartial) rmSync(partial,{force:true}); throw error; }
}

export async function fetchDumpPrefix({month,bytes,outDir=new URL('../data/book-sources/raw/',import.meta.url)}) {
  bytes=Number(bytes);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!validSize(bytes)) throw new Error('Invalid month or prefix size (hard cap 200 MB)');
  mkdirSync(outDir,{recursive:true});
  const sourceUrl=`https://database.lichess.org/standard/lichess_db_standard_rated_${month}.pgn.zst`;
  const file=new URL(`lichess_db_standard_rated_${month}.pgn.zst.prefix-${bytes}.part`,outDir);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),120000);
  try {
    const response=await fetch(sourceUrl,{headers:{Range:`bytes=0-${bytes-1}`,'User-Agent':'astra-chess bounded offline CC0 book snapshot'},signal:controller.signal});
    const receipt={sourceUrl,month,retrievedAt:new Date().toISOString(),
      ...await savePrefixResponse(response,{file:fileURLToPath(file),bytes}),rights:'CC0-1.0',
      rightsSourceUrl:'https://database.lichess.org/'};
    writeFileSync(new URL(file.href+'.meta.json'),JSON.stringify(receipt,null,2)+'\n');
    return receipt;
  } finally {clearTimeout(timer);}
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args[0]!=='dump') throw new Error('Only dump --month YYYY-MM --bytes N is supported; no explorer/authentication path.');
  const value=key=>args[args.indexOf(key)+1];
  console.log(JSON.stringify(await fetchDumpPrefix({month:value('--month'),bytes:value('--bytes')}),null,2));
}
