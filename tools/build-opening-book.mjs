import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileBook } from '../src/opening-book.mjs';

const directory = new URL('../data/openings/', import.meta.url);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Local, pinned inputs only: rebuilding never fetches moving network data. */
export function importOpeningLines() {
  const source = JSON.parse(readFileSync(new URL('SOURCE.json', directory)));
  for (const [name, expected] of Object.entries(source.sha256)) {
    if (sha256(readFileSync(new URL(name, directory))) !== expected) throw new Error(`Source checksum mismatch: ${name}`);
  }
  const unique = new Map();
  const rowsByVolume = {};
  const ecoCodes = new Set();
  let rows = 0;
  for (const volume of ['a','b','c','d','e']) {
    const text = readFileSync(new URL(`${volume}.tsv`, directory), 'utf8');
    const [header, ...records] = text.trimEnd().split('\n');
    if (header !== 'eco\tname\tpgn') throw new Error('Unexpected TSV header');
    rowsByVolume[volume.toUpperCase()] = records.length;
    for (const record of records) {
      const fields = record.split('\t');
      if (fields.length !== 3) throw new Error('Unexpected TSV fields');
      const [eco, name, pgn] = fields;
      if (!new RegExp(`^${volume.toUpperCase()}[0-9]{2}$`).test(eco) || !name) throw new Error('Invalid opening identity');
      // This source is a single mainline: reject comments, variations or results.
      const tokens = pgn.trim().split(/\s+/).filter(token => !/^\d+\.(?:\.\.)?$/.test(token));
      if (!tokens.length || tokens.some(token => !/^[a-zA-Z0-9=+#-]+$/.test(token))) throw new Error(`Unexpected PGN: ${pgn}`);
      const moves = tokens.join(' ');
      ecoCodes.add(eco);
      rows++;
      const existing = unique.get(moves);
      if (existing) existing.aliases.push({eco,name});
      else unique.set(moves, { eco, name, weight:1, moves, aliases:[] });
    }
  }
  // A parent named position is not another independent continuation vote.
  // Keep only maximal unique SAN paths; every removed row is still a fully
  // validated prefix of a retained path. Exact duplicate paths count once.
  const prefixes = new Set();
  for (const moves of unique.keys()) {
    const tokens = moves.split(' ');
    for (let n=1; n<tokens.length; n++) prefixes.add(tokens.slice(0,n).join(' '));
  }
  const lines = [...unique.values()].filter(line => !prefixes.has(line.moves));
  return { lines, source, importStats:{ rows, rowsByVolume, sourceEcoCodes:ecoCodes.size,
    retainedTerminalEcoCodes:new Set(lines.map(line=>line.eco)).size, uniquePaths:unique.size,
    duplicateRows:rows-unique.size, prefixOnlyPaths:unique.size-lines.length, retainedLines:lines.length } };
}

export function buildOpeningBook() {
  const { lines, source, importStats } = importOpeningLines();
  const started = performance.now();
  const book = compileBook(lines, {maxPlies:32});
  const compileMs = performance.now()-started;
  const text = JSON.stringify(book)+'\n';
  const entries = Object.values(book.positions).flat();
  const lengths = lines.map(line => line.moves.split(' ').length);
  const uniquePrefixes = new Set();
  for (const line of lines) {
    const moves = line.moves.split(' ');
    for (let n=1; n<=moves.length; n++) uniquePrefixes.add(moves.slice(0,n).join(' '));
  }
  const stats = { sourceRevision:source.revision, license:source.license, ...importStats,
    maxPlies:book.maxPlies, longestValidatedLine:Math.max(...lengths),
    totalLinePlies:lengths.reduce((a,b)=>a+b,0), validatedUniquePrefixes:uniquePrefixes.size,
    positions:Object.keys(book.positions).length, continuations:entries.length,
    deepestSelectionPly:Math.max(...entries.map(entry=>entry.ply)),
    artifactBytes:Buffer.byteLength(text), artifactSha256:sha256(text),
    weighting:'One vote per maximal unique SAN path; not game popularity, outcomes, or neural scores.' };
  return {book,text,stats,compileMs};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {text,stats,compileMs} = buildOpeningBook();
  writeFileSync(new URL('../public/openings.json',import.meta.url),text);
  writeFileSync(new URL('STATS.json',directory),JSON.stringify(stats,null,2)+'\n');
  console.log(JSON.stringify({...stats,compileMs},null,2));
}
