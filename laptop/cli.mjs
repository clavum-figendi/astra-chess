#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { parseModel } from '../src/network.mjs';
import { chooseMove } from '../src/engine.mjs';
import { createProtocol } from './protocol.mjs';

const args = process.argv.slice(2);
const modelAt = args.indexOf('--model');
const modelId = modelAt >= 0 ? args[modelAt + 1] : 'atlas';
if (!['atlas','pocket'].includes(modelId)) { console.error('Model must be pocket or atlas'); process.exit(1); }
const local = new URL(`../models/${modelId}.bin`, import.meta.url);
const development = new URL(`../public/models/${modelId}.bin`, import.meta.url);
const bytes = readFileSync(existsSync(fileURLToPath(local)) ? local : development);
const model = parseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const fenAt = args.indexOf('--fen');
if (fenAt >= 0) {
  if (!args[fenAt + 1]) throw new Error('--fen requires a quoted FEN');
  console.log(JSON.stringify(chooseMove(args[fenAt + 1], model), null, 2));
} else {
  const protocol = createProtocol({ send: line => console.log(line), select: fen => chooseMove(fen, model) });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', line => { if (line.trim() === 'quit') input.close(); else protocol(line); });
}
