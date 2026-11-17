// Run once after acquisition; the saved SOURCE is then the immutable offline input receipt.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
const raw=readFileSync(new URL('data/book-sources/raw/prefix.headers.txt',root));
writeFileSync(new URL('data/book-sources/evidence/prefix-response-headers.txt',root),raw);
const selectedMeta=JSON.parse(readFileSync(new URL('data/book-sources/selected-games.meta.json',root)));
const evidence=['data/book-sources/evidence/database.txt','data/book-sources/evidence/cc0-1.0-legalcode.txt',
  'data/book-sources/evidence/prefix-response-headers.txt','data/book-sources/probes/probe-masters-401.json',
  'data/book-sources/probes/probe-lichess-401.json'];
const source={kind:'bounded-official-lichess-CC0-export',
  sourceUrl:'https://database.lichess.org/standard/lichess_db_standard_rated_2026-09.pgn.zst',
  rights:'CC0-1.0',rightsSourceUrl:'https://database.lichess.org/',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt',
  retrievedAt:raw.toString().match(/^date: (.*)$/mi)[1].trim(),
  contentRange:raw.toString().match(/^content-range: (.*)$/mi)[1].trim(),
  etag:raw.toString().match(/^etag: (.*)$/mi)[1].trim(),
  ...selectedMeta,evidenceSha256:Object.fromEntries(evidence.map(file=>[file,digest(readFileSync(new URL(file,root)))])),
  limitations:['Chronological prefix sample, not a representative estimate of all Lichess games.',
    '2200 is the Lichess rating of both players at game time; no FIDE rating or titled-player claim.',
    'Slow profile is a subset of the same sampled games, not a separate database.',
    'Original source game must have a completed result; retained source includes only the first <=24 SAN plies.',
    'Masters explorer was denied anonymously (401); no Masters data or API rights inferred from server software licenses.']};
writeFileSync(new URL('data/book-sources/SOURCE.json',root),JSON.stringify(source,null,2)+'\n');
mkdirSync(new URL('public/books/',root),{recursive:true});
writeFileSync(new URL('public/books/CC0-1.0.txt',root),readFileSync(new URL('data/book-sources/evidence/cc0-1.0-legalcode.txt',root)));
console.log(JSON.stringify(source,null,2));
