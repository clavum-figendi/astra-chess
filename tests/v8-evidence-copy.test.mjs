import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';import {copyEvidence} from '../tools/build.mjs';
test('raw HTML evidence is preserved as inert text with a digest map, never served as HTML',async()=>{
 const root=await mkdtemp(join(process.env.TMPDIR,'v8-evidence-'));
 try{const src=join(root,'src'),dest=join(root,'dest');await mkdir(join(src,'nested'),{recursive:true});const html='<script>window.untrusted=true</script><p>Evidence</p>';
 await writeFile(join(src,'nested/page.html'),html);await writeFile(join(src,'report.json'),'{}');await copyEvidence(src,dest);
 await assert.rejects(access(join(dest,'nested/page.html')));assert.equal(await readFile(join(dest,'nested/page.html.txt'),'utf8'),html);assert.equal(await readFile(join(src,'nested/page.html'),'utf8'),html);assert.equal(await readFile(join(dest,'report.json'),'utf8'),'{}');
 const map=JSON.parse(await readFile(join(dest,'HTML-EVIDENCE.json'),'utf8'));assert.deepEqual(map.files,[{original:'nested/page.html',published:'nested/page.html.txt',sha256:createHash('sha256').update(html).digest('hex')}]);
 }finally{await rm(root,{recursive:true,force:true});}
});
