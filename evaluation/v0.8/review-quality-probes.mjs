// Read-only review probes: temporary fixtures only; production is never edited.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,access,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {savePrefixResponse} from '../../tools/v8-books-fetch.mjs';
const dir=await mkdtemp(join(process.env.TMPDIR || '/home/hermes/.hermes/cache/scratch','v8-quality-'));
try {
  const file=join(dir,'prefix.part');
  const partial=file+'.download';
  const sentinel='another acquisition owns this partial';
  await writeFile(partial,sentinel);
  let error;
  try {await savePrefixResponse(new Response('test',{status:206,headers:{'content-range':'bytes 0-3/100'}}),{file,bytes:4});}
  catch(e){error={code:e.code,message:e.message};}
  let survived=true;
  try{await access(partial);}catch{survived=false;}
  const finalExists=await access(file).then(()=>true,()=>false);
  const unchanged=survived && await readFile(partial,'utf8')===sentinel;
  assert.equal(error?.code,'EEXIST');
  // This assertion describes the observed defect, NOT the desired acceptance behavior.
  assert.equal(survived,false,'probe no longer reproduces: rerun quality review after fix');
  console.log(JSON.stringify({probe:'exclusive-create collision cleanup ownership',error,existingPartialSurvived:survived,existingPartialUnchanged:unchanged,finalExists,defectReproduced:!survived},null,2));
}finally{await rm(dir,{recursive:true,force:true});}
