import { cp, mkdir, rm, writeFile, readFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export async function copyEvidence(source, destination) {
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(directory,entry.name),relative+'/');
      else if (/\.html?$/i.test(entry.name)) {
        const published = relative + '.txt';
        try { await access(join(source,published)); throw new Error('Evidence text alias collision'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const bytes = await readFile(join(source,relative));
        files.push({original:relative,published,sha256:createHash('sha256').update(bytes).digest('hex')});
      }
    }
  }
  await walk(source);
  await cp(source,destination,{recursive:true,filter:path=>!(/\.html?$/i.test(path))});
  for (const file of files) await cp(join(source,file.original),join(destination,file.published));
  await writeFile(join(destination,'HTML-EVIDENCE.json'),JSON.stringify({note:'Raw HTML is preserved byte-for-byte as inert text; originals remain in the source repository.',files:files.sort((a,b)=>a.original.localeCompare(b.original))},null,2)+'\n');
}

export async function buildSite(root) {
  const dist = join(root,'dist');
  const laptop = join(root,'build/laptop');
  let hasBookRegistry = true;
  try {
    // Check the registry itself, not an entire recursive copy: a missing child
    // asset must never be mistaken for a legacy tree without profiles.
    const registry = JSON.parse(await readFile(join(root,'public/books/manifest.json'),'utf8'));
    if (registry.version !== 1 || registry.default !== 'eco' || !Array.isArray(registry.books) || !registry.books.length) throw new Error('Invalid opening-book registry.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const legacyBook = JSON.parse(await readFile(join(root,'public/openings.json'),'utf8'));
    let legacyWorker = '';
    try { legacyWorker = await readFile(join(root,'public/worker.mjs'),'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (legacyBook.version !== 1 || !legacyBook.positions || typeof legacyBook.positions !== 'object' || Array.isArray(legacyBook.positions) || legacyWorker.includes('./books/')) throw new Error('Opening-book registry is required for profile-aware builds.');
    hasBookRegistry = false;
  }
  await rm(dist,{recursive:true,force:true});
  await rm(laptop,{recursive:true,force:true});
  await mkdir(dist,{recursive:true}); await mkdir(laptop,{recursive:true});
  let browserDescriptor;
  try { browserDescriptor = JSON.parse(await readFile(join(root,'public/models/deepmind-browser.json'),'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sparseManifest = JSON.parse(await readFile(join(root,'public/models/manifest.json'),'utf8'));
  let active;
  try { active = JSON.parse(await readFile(join(root,'public/models/active.json'),'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (active) {
    if (!Array.isArray(active.sparse) || !active.sparse.length || new Set(active.sparse.map(m=>m.id)).size !== active.sparse.length) throw new Error('Invalid active catalogue');
    sparseManifest.models = active.sparse.map(entry=>{
      const model = sparseManifest.models.find(m=>m.id===entry.id);
      if (!model) throw new Error('Unknown active model');
      return {...model,name:entry.name || model.name};
    });
  }
  const allowedSparse = new Set(sparseManifest.models.map(m=>join(root,'public/models',m.file)));
  const include = path => path.endsWith('.bin') ? !active || allowedSparse.has(path) : !path.endsWith('.onnx') || browserDescriptor?.models?.some(m=>path===join(root,'public/models',m.file));
  await cp(join(root,'public'),dist,{recursive:true,filter:include});
  await writeFile(join(dist,'models/manifest.json'),JSON.stringify(sparseManifest,null,2)+'\n');
  if (browserDescriptor) {
    const manifest = JSON.parse(await readFile(join(dist,'models/manifest.json'),'utf8'));
    if (!Array.isArray(browserDescriptor.models)) throw new Error('Invalid browser model descriptor');
    manifest.models.push(...browserDescriptor.models.map(model=>({architecture:browserDescriptor.architecture,config:browserDescriptor.config,runtimeOptions:browserDescriptor.runtime,...model})));
    if (new Set(manifest.models.map(m=>m.id)).size !== manifest.models.length) throw new Error('Duplicate model identifier');
    await writeFile(join(dist,'models/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  await cp(join(root,'src'),join(dist,'src'),{recursive:true});
  const vendor = join(root,'node_modules/chess.js');
  await cp(join(vendor,'dist/esm/chess.js'),join(dist,'src/chess.mjs'));
  await cp(join(vendor,'LICENSE'),join(dist,'CHESS-JS-LICENSE.txt'));
  await writeFile(join(dist,'.nojekyll'),'');
  await cp(join(root,'docs'),join(dist,'docs'),{recursive:true,filter:path=>!path.endsWith('REPOSITORY-REMOVAL.md')});
  await cp(join(root,'README.md'),join(dist,'README.md'));
  await cp(join(root,'LICENSE'),join(dist,'LICENSE'));
  await cp(join(dist,'src'),join(laptop,'src'),{recursive:true});
  await cp(join(root,'laptop'),join(laptop,'laptop'),{recursive:true});
  await cp(join(root,'public/models'),join(laptop,'models'),{recursive:true,filter:path=>include(path)&&!path.endsWith('.onnx')&&!path.endsWith('deepmind-browser.json')});
  await writeFile(join(laptop,'models/manifest.json'),JSON.stringify(sparseManifest,null,2)+'\n');
  await cp(join(root,'public/openings.json'),join(laptop,'openings.json'));
  if (hasBookRegistry) await cp(join(root,'public/books'),join(laptop,'books'),{recursive:true});
  for (const name of ['README.md','LICENSE','CHESS-JS-LICENSE.txt']) await cp(join(dist,name),join(laptop,name));
  await cp(join(dist,'docs'),join(laptop,'docs'),{recursive:true});
  try { await cp(join(root,'public/DEEPMIND-CODE-LICENSE.txt'),join(laptop,'DEEPMIND-CODE-LICENSE.txt')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(join(laptop,'package.json'),JSON.stringify({name:'chess-lab-laptop',version:'0.4.0',type:'module',private:true}));
  try { await cp(join(root,'public/OPENING-BOOK-NOTICE.txt'),join(laptop,'OPENING-BOOK-NOTICE.txt')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await access(join(root,'evaluation/results.json'));
    await copyEvidence(join(root,'evaluation'),join(dist,'evaluation'));
    await copyEvidence(join(root,'evaluation'),join(laptop,'evaluation'));
    await cp(join(root,'evaluation/results.json'),join(dist,'evaluation.json'));
  } catch (error) { if(error.code!=='ENOENT') throw error; }
  await mkdir(join(dist,'downloads'),{recursive:true});
  execFileSync('zip',['-q','-r',join(dist,'downloads/astra-chess-laptop.zip'),'.'],{cwd:laptop});
  return {dist,laptop};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildSite(fileURLToPath(new URL('..',import.meta.url))));
}
