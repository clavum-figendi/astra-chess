// Desired-behavior regression. Historical bug-confirming probe stays untouched.
// Optional module path permits RED verification against preserved pre-fix bytes.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,access,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const moduleURL=process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : new URL('../../tools/v8-books-fetch.mjs',import.meta.url).href;
const {savePrefixResponse}=await import(moduleURL);
const dir=await mkdtemp(join(process.env.TMPDIR || '/home/hermes/.hermes/cache/scratch','v8-quality-final-'));
try {
  const file=join(dir,'prefix.part'),partial=file+'.download';
  const sentinel='another acquisition owns this partial',archive='existing completed archive';
  await writeFile(partial,sentinel);await writeFile(file,archive);
  let error;
  try{await savePrefixResponse(new Response('test',{status:206,headers:{'content-range':'bytes 0-3/100'}}),{file,bytes:4});}
  catch(e){error={code:e.code,message:e.message};}
  const survived=await access(partial).then(()=>true,()=>false);
  const unchanged=survived && await readFile(partial,'utf8')===sentinel;
  const archiveUnchanged=await readFile(file,'utf8')===archive;
  const result={probe:'QUALITY-1 desired cleanup ownership',moduleURL,errorCode:error?.code,existingPartialSurvived:survived,existingPartialUnchanged:unchanged,existingArchiveUnchanged:archiveUnchanged};
  console.log(JSON.stringify(result,null,2));
  assert.equal(error?.code,'EEXIST');
  assert.equal(survived,true,'EEXIST must preserve a partial owned by another acquisition');
  assert.equal(unchanged,true,'partial bytes must be untouched');
  assert.equal(archiveUnchanged,true,'completed archive bytes must be untouched');
}finally{await rm(dir,{recursive:true,force:true});}
