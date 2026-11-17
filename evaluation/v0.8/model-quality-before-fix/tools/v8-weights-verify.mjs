// Independent deployed-runtime development check; never opens new v8 holdouts.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseModel} from '../src/network.mjs';
import {chooseMove} from '../src/engine.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const rows=JSON.parse(readFileSync('.cache/deepmind-v5/validation.json'));
for(const family of ['pocket','atlas']){
 const path=`evaluation/v0.8/weight-${family}-artifacts.json`,report=JSON.parse(readFileSync(path));
 const baseline=readFileSync(report.base);if(sha(baseline)!==report.baseSHA256)throw Error('base was modified');
 for(const candidate of report.candidates){
  const bytes=readFileSync(candidate.file);if(sha(bytes)!==candidate.sha256)throw Error('candidate changed');
  const model=parseModel(Uint8Array.from(bytes).buffer);let hits=0;
  const predictions=rows.map(row=>{const result=chooseMove(row.fen,model);if(result.move===row.bestmove)hits++;if(!row.legal.includes(result.move))throw Error('illegal deployed prediction');return {id:row.id,move:result.move,best:row.bestmove};});
  candidate.deployedDevelopmentValidation={count:rows.length,bestmoveCorrect:hits,top1:hits/rows.length,predictions};
  candidate.float32FeatureMetricDisagreement=hits-candidate.metrics.validation.bestmoveCorrect;
  console.log(JSON.stringify({family,id:candidate.id,deployedCorrect:hits,trainingFeatureCorrect:candidate.metrics.validation.bestmoveCorrect}));
 }
 report.verificationSourceSHA256=sha(readFileSync(import.meta.filename));report.developmentDatasetSHA256=sha(readFileSync('.cache/deepmind-v5/validation.json'));
 writeFileSync(path,JSON.stringify(report,null,2)+'\n');
}
