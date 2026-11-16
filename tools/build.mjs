import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export async function buildSite(root) {
  const dist = join(root,'dist');
  const laptop = join(root,'build/laptop');
  await rm(dist,{recursive:true,force:true});
  await rm(laptop,{recursive:true,force:true});
  await mkdir(dist,{recursive:true}); await mkdir(laptop,{recursive:true});
  await cp(join(root,'public'),dist,{recursive:true});
  await cp(join(root,'src'),join(dist,'src'),{recursive:true});
  const vendor = join(root,'node_modules/chess.js');
  await cp(join(vendor,'dist/esm/chess.js'),join(dist,'src/chess.mjs'));
  await cp(join(vendor,'LICENSE'),join(dist,'CHESS-JS-LICENSE.txt'));
  await writeFile(join(dist,'.nojekyll'),'');
  await cp(join(root,'docs'),join(dist,'docs'),{recursive:true});
  await cp(join(root,'README.md'),join(dist,'README.md'));
  await cp(join(root,'LICENSE'),join(dist,'LICENSE'));
  await cp(join(dist,'src'),join(laptop,'src'),{recursive:true});
  await cp(join(root,'laptop'),join(laptop,'laptop'),{recursive:true});
  await cp(join(root,'public/models'),join(laptop,'models'),{recursive:true});
  await cp(join(root,'public/openings.json'),join(laptop,'openings.json'));
  for (const name of ['README.md','LICENSE','CHESS-JS-LICENSE.txt']) await cp(join(dist,name),join(laptop,name));
  await cp(join(root,'docs'),join(laptop,'docs'),{recursive:true});
  await writeFile(join(laptop,'package.json'),JSON.stringify({name:'chess-lab-laptop',version:'0.4.0',type:'module',private:true}));
  try {
    await access(join(root,'evaluation/results.json'));
    await cp(join(root,'evaluation'),join(dist,'evaluation'),{recursive:true});
    await cp(join(root,'evaluation'),join(laptop,'evaluation'),{recursive:true});
    await cp(join(root,'evaluation/results.json'),join(dist,'evaluation.json'));
  } catch (error) { if(error.code!=='ENOENT') throw error; }
  await mkdir(join(dist,'downloads'),{recursive:true});
  execFileSync('zip',['-q','-r',join(dist,'downloads/astra-chess-laptop.zip'),'.'],{cwd:laptop});
  return {dist,laptop};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildSite(fileURLToPath(new URL('..',import.meta.url))));
}
