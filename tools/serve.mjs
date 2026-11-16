import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function serve(root, port = 4173) {
  root = resolve(root);
  const mime = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8','.zip':'application/zip'};
  const server = http.createServer(async (req,res) => {
    try {
      const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file = resolve(root, '.' + (path.endsWith('/') ? path+'index.html' : path));
      if (!file.startsWith(root+sep)) { res.writeHead(403); res.end('Forbidden'); return; }
      const data = await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)] ?? 'application/octet-stream','Cache-Control':'no-cache'});
      res.end(data);
    } catch(error) { res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found'); }
  });
  await new Promise((done,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',done); });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await serve(fileURLToPath(new URL('../dist',import.meta.url)),Number(process.env.PORT ?? 4173));
  console.log(`Astra Chess at http://127.0.0.1:${server.address().port}`);
}
