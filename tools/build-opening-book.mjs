import { writeFileSync } from 'node:fs';
import { compileBook } from '../src/opening-book.mjs';

// Small original curation of standard opening moves, not imported game data.
// Branch weights bias common continuations without forcing identical games.
const lines = [
  ['Ruy Lopez',4,'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5'],
  ['Berlin',2,'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6'],
  ['Italian quiet',4,'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O'],
  ['Italian open',2,'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+'],
  ['Two knights',2,'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 O-O d6 c3 O-O'],
  ['Scotch',2,'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nc3 Bb4 Nxc6 bxc6'],
  ['Four knights',1,'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6'],
  ['Vienna',1,'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d3 Nxc3'],
  ['Kings gambit',1,'e4 e5 f4 exf4 Nf3 d5 exd5 Nf6 Bc4 Nxd5 O-O Be7'],
  ['Petrov',2,'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Be7'],
  ['Philidor',1,'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O'],
  ['Sicilian Najdorf',4,'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5'],
  ['Sicilian dragon',2,'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7'],
  ['Sicilian classical',2,'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6'],
  ['Sicilian accelerated',2,'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Bg7 Be3 Nf6'],
  ['Sicilian Alapin',2,'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6 Be2 Nc6'],
  ['Sicilian closed',1,'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3 e6'],
  ['French advance',2,'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 Bd7'],
  ['French classical',2,'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7'],
  ['French Tarrasch',1,'e4 e6 d4 d5 Nd2 c5 exd5 exd5 Ngf3 Nc6 Bb5 Bd6'],
  ['French exchange',1,'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O'],
  ['Caro Kann classical',2,'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6'],
  ['Caro Kann advance',2,'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 O-O Nc6'],
  ['Caro Kann Panov',1,'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Bb4'],
  ['Scandinavian',1,'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5'],
  ['Pirc',1,'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6'],
  ['Alekhine',1,'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7'],
  ['Queens gambit declined',4,'d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6'],
  ['Queens gambit accepted',2,'d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6'],
  ['Slav',3,'d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6'],
  ['Semi Slav',2,'d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4'],
  ['Kings Indian',3,'d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5'],
  ['Nimzo Indian',3,'d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5'],
  ['Queens Indian',2,'d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O'],
  ['Grunfeld',2,'d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7'],
  ['Benoni',1,'d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 Nf3 g6'],
  ['Dutch',1,'d4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6'],
  ['London',2,'d4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nbd2 Bd6'],
  ['English symmetric',2,'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O'],
  ['English reversed Sicilian',2,'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6'],
  ['Reti',2,'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5'],
  ['Larsen',1,'b3 d5 Bb2 Nf6 e3 e6 Nf3 Be7 c4 O-O Be2 c5'],
].map(([name,weight,moves])=>({name,weight,moves}));
const book = compileBook(lines, {maxPlies:12});
writeFileSync(new URL('../public/openings.json',import.meta.url),JSON.stringify(book,null,2)+'\n');
console.log(`Validated ${lines.length} opening branches; ${Object.keys(book.positions).length} exact positions.`);
