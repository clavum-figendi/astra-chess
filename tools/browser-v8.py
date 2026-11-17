"""Actual V8 browser/profile checks under a project subpath; no fake policy."""
import hashlib,json,os,re,subprocess,threading,time
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
OUT=ROOT/'.cache/v8/browser'
CHROME=os.environ.get('ASTRA_CHROMIUM')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 manifest=json.loads((DIST/'models/manifest.json').read_text());books=json.loads((DIST/'books/manifest.json').read_text())['books']
 models=manifest['models'];assert len(models)==3 and len(books)==3
 source_files=[DIST/p for p in ['index.html','app.mjs','worker.mjs','style.css','books/manifest.json','models/manifest.json','src/book-sources.mjs','src/opening-book.mjs','src/chess.mjs','src/engine.mjs','src/transformer.mjs','src/clock.mjs','src/premove.mjs','src/sound.mjs']]
 source_files += [DIST/'models'/m['file'] for m in models]+[(DIST/'books'/b['file']).resolve() for b in books]
 binding={str(p.relative_to(DIST)):sha(p) for p in source_files}
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(DIST),**kw)
  def do_GET(self):
   if not self.path.startswith('/chesslab/'):self.send_error(404);return
   self.path=self.path.removeprefix('/chesslab');super().do_GET()
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 url=f'http://127.0.0.1:{server.server_port}/chesslab/'
 checks=[];errors=[];matrix=[]
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--no-sandbox'])
   browser_version=browser.version
   context=browser.new_context(viewport={'width':1280,'height':1050},accept_downloads=True)
   page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(url,wait_until='networkidle');page.wait_for_function("document.querySelector('#book-source').options.length===3")
   assert not page.locator('#technical-panel').evaluate('(e)=>e.open')
   assert page.locator('#book-source').input_value()=='eco'
   page.select_option('#time-control','unlimited');page.select_option('#color','b')
   def start():
    page.click('#new-game');page.wait_for_function("document.querySelector('#status').textContent==='Your move' && document.querySelectorAll('.move-san').length===1",timeout=60000)
   def pgn():
    with page.expect_download() as d:page.click('#download-pgn')
    return Path(d.value.path()).read_text()
   def tag(text,name):
    match=re.search(r'\['+name+r' "([^"]*)"\]',text);assert match,(name,text);return match.group(1)
   node="import fs from 'node:fs';import{chooseBookMove,seededRandom}from'./src/opening-book.mjs';const x=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(chooseBookMove(x.fen,JSON.parse(fs.readFileSync(x.file)),{random:seededRandom(x.seed)})));"
   startfen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
   for book in books:
    page.select_option('#book-source',book['id'])
    for model in models:
     page.select_option('#model',model['id']);start();text=pgn()
     assert tag(text,'BookSource')==book['id'] and tag(text,'BookHash')==book['sha256'] and tag(text,'BookHashAlgorithm')=='SHA256' and tag(text,'Book')=='on'
     assert page.locator('#move-source').text_content()=='book'
     expected=json.loads(subprocess.check_output(['node','--input-type=module','-e',node],input=json.dumps({'file':str((DIST/'books'/book['file']).resolve()),'fen':startfen,'seed':tag(text,'Seed')}),text=True,cwd=ROOT))

     # Parse the downloaded actual PGN with the same standalone rules module.
     parse="import fs from 'node:fs';import{Chess}from'./src/chess.mjs';const c=new Chess();c.loadPgn(fs.readFileSync(0,'utf8'));console.log(c.history({verbose:true})[0].lan);"
     move=subprocess.check_output(['node','--input-type=module','-e',parse],input=text,text=True,cwd=ROOT).strip();assert move==expected['move']
     matrix.append({'model':model['id'],'book':book['id'],'move':move,'sha256':book['sha256'],'seed':tag(text,'Seed')})
     if model==models[0]:
      # A fresh worker must use the real CacheStorage record without compiling.
      page.route('**/src/book-sources.mjs',lambda route:route.abort())
      start();assert page.locator('#move-source').text_content()=='book'
      page.unroute('**/src/book-sources.mjs')
   checks.append('All 3 models x 3 books: actual assets, first move, seed/Node parity, PGN source/hash; cached source survives fresh workers')
   page.uncheck('#book')
   for model in models:
    page.select_option('#model',model['id']);start();assert page.locator('#move-source').text_content()=='policy'
    assert tag(pgn(),'Book')=='off'
   checks.append('All three actual policy runtimes produce book-off moves, including ONNX/WASM')
   page.select_option('#model',models[0]['id']);page.select_option('#color','w');page.click('#new-game')
   page.wait_for_function("document.querySelector('#status').textContent==='Your move'",timeout=60000)
   queued=page.evaluate("()=>{for(const s of ['e2','e4','g1','f3'])document.querySelector('[data-square=\"'+s+'\"]').click();return document.querySelectorAll('.square.premove').length;}")
   assert queued==2
   page.wait_for_function("document.querySelectorAll('.move-san').length>=3",timeout=30000)
   assert 'Nf3' in pgn();assert page.locator('.square.premove').count()==0
   checks.append('Actual policy reply consumes one legal premove and clears queue highlights')
   page.check('#book');page.select_option('#book-source','lichess-2200');page.select_option('#model',models[2]['id']);page.select_option('#color','b');page.click('#new-game')
   assert 'Loading' in (page.locator('#status').text_content() or '')
   page.select_option('#book-source','lichess-2200-slow');page.wait_for_timeout(1500)
   assert page.locator('.move-san').count()==0 and 'Settings changed' in page.locator('#status').text_content()
   start();assert tag(pgn(),'BookSource')=='lichess-2200-slow'
   checks.append('Profile change during pending startup cancels the old generation; next game captures the new source')
   page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
   page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
   page.set_viewport_size({'width':1280,'height':1050});page.uncheck('#book');page.select_option('#model',models[0]['id']);page.select_option('#color','w')
   for control in ['60,0','180,2','300,0','600,5','unlimited']:
    page.select_option('#time-control',control);assert not page.locator('#custom-time').is_visible()
   page.select_option('#time-control','custom');page.fill('#custom-minutes','0.05');page.fill('#custom-increment','0');page.click('#new-game')
   page.wait_for_function("document.querySelector('#status').textContent==='Your move'",timeout=60000)
   page.wait_for_function("/time|flag/i.test(document.querySelector('#status').textContent)",timeout=15000)
   assert tag(pgn(),'Result')=='0-1'
   checks.append('Time-control options and real three-second custom clock/flag result')
   page.check('#sound');page.reload(wait_until='networkidle');assert page.locator('#sound').is_checked();page.uncheck('#sound')
   assert not errors,errors
   browser.close()
 finally:server.shutdown();server.server_close()
 assert binding=={str(p.relative_to(DIST)):sha(p) for p in source_files}
 receipt={'sourceHashes':binding,'scriptSHA256':sha(Path(__file__)),'browserVersion':browser_version,'checks':checks,'bookModelMatrix':matrix,'pageErrors':errors,'screenshots':{p.name:sha(p) for p in OUT.glob('*.png')},'scope':'Actual built app under /chesslab/, not hosted deployment; no latency or strength claim.'}
 (OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
if __name__=='__main__':main()
