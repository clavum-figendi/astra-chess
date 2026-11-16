import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),dir='.cache/v7',out='evaluation/v0.7';
if(existsSync(`${dir}/test-exposed.json`)||existsSync(`${dir}/selection.json`))throw new Error('v7 frozen');
const protocol=JSON.parse(readFileSync(`${out}/data-protocol.json`));if(!protocol.finishedAt)throw new Error('Fresh dataset incomplete');
const data=readFileSync(`${dir}/validation.json`);if(hash(data)!==protocol.splitSHA256.validation)throw new Error('Data binding mismatch');const rows=JSON.parse(data);
const candidates=JSON.parse(readFileSync('public/models/manifest.json')).models.filter(m=>/^(pocket|atlas)/.test(m.id)).map(m=>({...m,file:`public/models/${m.file}`,control:true}));
for(const p of JSON.parse(readFileSync(`${out}/sparse-proposals.json`)).proposals)candidates.push({...p,control:false});
const summaries=[];
for(const candidate of candidates){
 const bytes=readFileSync(candidate.file);if(hash(bytes)!==candidate.sha256)throw new Error('Candidate changed');
 const model=parseModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),answers=[];
 for(const row of rows){const r=chooseMove(row.fen,model);if(!row.legal.includes(r.move))throw new Error('Illegal policy choice');answers.push({id:row.id,move:r.move,bestmove:row.bestmove,top4:row.teacher.some(t=>t.move===r.move)});}
 const record={id:candidate.id,file:candidate.file,sha256:candidate.sha256,bytes:bytes.length,control:candidate.control,count:rows.length,hits:answers.filter(a=>a.move===a.bestmove).length,top4:answers.filter(a=>a.top4).length,answers};summaries.push(record);console.log(JSON.stringify({...record,answers:undefined}));
}
const ordering=(a,b)=>b.hits-a.hits||Number(b.control)-Number(a.control)||a.bytes-b.bytes||a.id.localeCompare(b.id),selected={};
for(const family of ['pocket','atlas']){
 const ranking=summaries.filter(m=>m.id.startsWith(family)).sort(ordering),winner=ranking[0],control=ranking.find(m=>m.control);
 selected[family]={winner:{...winner,answers:undefined},control:{...control,answers:undefined}};
}
const report={validationSHA256:hash(data),selectionRule:'bestmove hits, unchanged control on tie, smaller bytes, identifier',summaries,selected};
writeFileSync(`${out}/sparse-validation.json`,JSON.stringify(report,null,2)+'\n');writeFileSync(`${dir}/sparse-selection.json`,JSON.stringify(selected,null,2)+'\n');
