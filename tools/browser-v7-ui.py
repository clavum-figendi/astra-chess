"""Source-bound V7 UI checks; isolated hardlinked dist snapshot, never builds shared dist."""
import argparse,hashlib,json,os,shutil,threading,time
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PREVIEW=ROOT/'.cache/v7-ui-preview'
OUT=ROOT/'.cache/v7-ui-evidence'
CHROME='/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell'
SOURCES=['public/index.html','public/style.css','public/app.mjs','src/premove.mjs','src/sound.mjs','src/clock.mjs','tools/browser-v7-ui.py']
def main():
 global OUT
 parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--output',default=str(OUT));args=parser.parse_args();OUT=Path(args.output)
 source_hashes={n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in SOURCES}
 if PREVIEW.exists():shutil.rmtree(PREVIEW)
 shutil.copytree(ROOT/'dist',PREVIEW,copy_function=os.link)
 for name in ['index.html','style.css','app.mjs','worker.mjs']:
  (PREVIEW/name).unlink();shutil.copy2(ROOT/'public'/name,PREVIEW/name)
 for source in (ROOT/'src').glob('*.mjs'):
  target=PREVIEW/'src'/source.name
  if target.exists():target.unlink()
  shutil.copy2(source,target)
 target=PREVIEW/'src/chess.mjs'
 if target.exists():target.unlink()
 shutil.copy2(ROOT/'node_modules/chess.js/dist/esm/chess.js',target)
 OUT.mkdir(parents=True,exist_ok=True)
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(PREVIEW),**kw)
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',4198),Handler)
 threading.Thread(target=server.serve_forever,daemon=True).start()
 checks=[];errors=[];geometry=[]
 fixture={'move':'e7e5','delay':950}
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=CHROME,headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1280,'height':1000},accept_downloads=True)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('''window.testNow=0;performance.now=()=>window.testNow;
  window.audioPeak=0;window.audioContexts=0;
  const Native=window.AudioContext;window.AudioContext=function(...args){
    window.audioContexts++;const ctx=new Native(...args),analyser=ctx.createAnalyser();window.testAudio=ctx;
    const original=ctx.createGain.bind(ctx),silent=original();silent.gain.value=0;analyser.connect(silent);silent.connect(ctx.destination);
    ctx.createGain=()=>{const gain=original();const connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>{const result=connect(target,...rest);if(target===ctx.destination){connect(analyser);window.audioProbeAttached=true;}return result;};return gain;};
    const data=new Float32Array(analyser.fftSize);setInterval(()=>{analyser.getFloatTimeDomainData(data);window.audioPeak=Math.max(window.audioPeak,...data.map(Math.abs));},5);return ctx;};''')
  def route_worker(route):
   route.fulfill(content_type='text/javascript',body=f"onmessage=({{data:d}})=>{{if(d.type==='load')postMessage({{type:'loaded',id:d.id,modelId:d.modelId}});else setTimeout(()=>postMessage({{type:'move',id:d.id,move:'{fixture['move']}',candidates:[{{move:'{fixture['move']}',score:1}}],elapsedMs:2,source:'policy'}}),{fixture['delay']});}}")
  page.route('**/worker.mjs',route_worker)
  page.goto(args.url or 'http://127.0.0.1:4198/',wait_until='networkidle')
  page.wait_for_selector('#model-downloads a',state='attached')
  assert not page.locator('#technical-panel').evaluate('(e)=>e.open')
  for selector in ['#latency','#fen','#model-downloads','#method','#size-proposals']:assert not page.locator(selector).is_visible(),selector
  assert page.locator('#premove').is_checked() and not page.locator('#sound').is_checked()
  assert page.evaluate('audioContexts')==0
  checks.append('default collapsed native details; technical content hidden; premoves on and sound off')
  page.locator('#technical-panel>summary').focus();page.keyboard.press('Enter');assert page.locator('#fen').is_visible()
  page.keyboard.press('Enter');assert not page.locator('#fen').is_visible()
  checks.append('keyboard disclosure opens and closes technical content')
  page.uncheck('#book')
  def squares(a,b):page.click('[data-square="'+a+'"]');page.click('[data-square="'+b+'"]')
  def start():
   page.click('#new-game');page.wait_for_function("document.querySelector('#status').textContent.startsWith('Your move')")
  def wait_moves(n):page.wait_for_function('(n)=>document.querySelectorAll(".move-san").length>=n',arg=n)
  def fen(value):
   if not page.locator('#technical-panel').evaluate('(e)=>e.open'):page.click('#technical-panel>summary')
   page.fill('#fen',value);page.click('#fen-form button');page.wait_for_function("!document.querySelector('#status').textContent.startsWith('Loading')")
  start();page.evaluate('testNow=250');squares('e2','e4');squares('g1','f3')
  assert page.locator('.square.premove').count()==2
  assert page.locator('.move-san').count()==1, 'premove must not execute before opponent reply'
  page.screenshot(path=str(OUT/'desktop-queued.png'),full_page=True)
  page.evaluate('testNow=1250');wait_moves(3)
  assert 'Nf3' in page.locator('#moves').inner_text() and page.locator('.move-san').count()==3
  assert page.locator('.square.premove').count()==0
  assert page.locator('#human-clock').inner_text()=='3:04',page.locator('#human-clock').inner_text()
  assert page.locator('#opponent-clock').inner_text()=='3:01'
  checks.append('legal premove executes exactly once; elapsed wall time charged, each move adds increment once')
  for cancel in ['escape','rightclick','button','toggle']:
   start();squares('e2','e4');squares('g1','f3')
   if cancel=='escape':page.keyboard.press('Escape')
   elif cancel=='rightclick':page.click('[data-square="e4"]',button='right')
   elif cancel=='button':page.click('#cancel-premove')
   else:page.uncheck('#premove');page.check('#premove')
   assert page.locator('.square.premove').count()==0
   wait_moves(2);assert 'Nf3' not in page.locator('#moves').inner_text()
  checks.append('Escape, right-click, explicit cancel and disabling premoves clear the queue')
  start();squares('e2','e4');squares('g1','g5');wait_moves(2)
  assert 'not legal' in page.locator('#premove-status').inner_text()
  assert page.locator('.square.premove').count()==0, 'discarded premove must clear board highlights'
  assert page.locator('#human-clock').inner_text()=='3:02'
  checks.append('illegal candidate may queue but is discarded without increment after legal recheck')
  for setting,value in [('model','atlas'),('color','b')]:
   page.select_option('#color','w');start();squares('e2','e4');squares('g1','f3');page.select_option('#'+setting,value)
   page.wait_for_timeout(1100);assert page.locator('.move-san').count()==0 and page.locator('.square.premove').count()==0
  page.select_option('#color','w');start();squares('e2','e4');squares('g1','f3');page.click('#new-game')
  page.wait_for_timeout(1100);assert page.locator('.move-san').count()==0
  checks.append('model, color and new-game reset cancel queues and stale asynchronous replies')
  page.select_option('#time-control','custom');page.fill('#custom-minutes','0.05');page.fill('#custom-increment','0');start()
  squares('e2','e4');squares('g1','f3');page.evaluate("testNow+=3001;document.dispatchEvent(new Event('visibilitychange'))")
  page.wait_for_timeout(1100);assert 'Black ran out' in page.locator('#status').inner_text();assert page.locator('.move-san').count()==1
  assert page.locator('.square.premove').count()==0
  checks.append('flag fall preempts queued move and ignores late worker response')
  page.select_option('#time-control','unlimited');fixture['move']='h8h7'
  fen('7k/P7/8/8/8/8/8/6K1 b - - 0 1');squares('a7','a8');assert '= Queen' in page.locator('#premove-status').inner_text();wait_moves(3)
  assert 'White queen' in page.locator('[data-square="a8"]').get_attribute('aria-label')
  checks.append('queued promotion autoqueens after opponent reply')
  fen('7k/P7/8/8/8/8/8/6K1 w - - 0 1');squares('a7','a8');assert page.locator('#promotion-dialog').is_visible();page.click('[data-promotion="n"]')
  assert 'insufficient material' in page.locator('#status').inner_text()
  checks.append('ordinary promotion retains four choices and underpromotion ends drawn game')
  fixture['move']='d8h4'
  fen('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');squares('b1','c3');page.wait_for_function("document.querySelector('#status').textContent.includes('Checkmate')")
  assert page.locator('.square.premove').count()==0 and 'Nc3' not in page.locator('#moves').inner_text()
  checks.append('opponent checkmate preempts premove')
  fixture['move']='e7e5';start();before=page.locator('#moves').inner_text();page.check('#sound');assert page.locator('#moves').inner_text()==before
  squares('e2','e4');page.wait_for_function('audioPeak>0.001');peak=page.evaluate('audioPeak');assert page.evaluate('audioProbeAttached');wait_moves(2)
  page.uncheck('#sound');page.wait_for_timeout(150);page.evaluate('audioPeak=0');page.wait_for_timeout(150);assert page.evaluate('audioPeak')<0.001
  page.check('#sound');page.reload();assert page.locator('#sound').is_checked() and page.evaluate('audioContexts')==0
  page.uncheck('#sound');page.reload();assert not page.locator('#sound').is_checked()
  checks.append({'realWebAudioSignalPeak':peak,'muteSilence':True,'persistedOnAndOff':True,'soundDoesNotResetGame':True})
  for width in [320,390,768,1280]:
   page.set_viewport_size({'width':width,'height':1000 if width>760 else 844})
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   sizes=page.locator('button:not(.square),select,summary,.sound-control,.book-toggle').evaluate_all('(els)=>els.filter(e=>e.getClientRects().length).map(e=>({id:e.id||e.className,height:e.getBoundingClientRect().height}))')
   assert all(x['height']>=44 for x in sizes),sizes
   geometry.append({'width':width,'board':page.locator('#board').bounding_box(),'targets':sizes})
   if width==390:page.screenshot(path=str(OUT/'mobile-390.png'),full_page=True)
  checks.append('320/390/768/1280 widths have no overflow and visible non-board controls meet 44px target height')
  # One real 9M inference with a queued black reply; no fixture or book involved.
  page.unroute('**/worker.mjs',route_worker);page.set_viewport_size({'width':1280,'height':1000})
  page.select_option('#model','deepmind-9m');page.select_option('#color','b');page.select_option('#time-control','unlimited');page.uncheck('#book');page.click('#new-game')
  page.wait_for_function("document.querySelector('#status').textContent.includes('thinking')",timeout=60000)
  squares('g8','f6');wait_moves(2)
  assert 'Nf6' in page.locator('#moves').inner_text()
  latency=page.locator('#latency').text_content();source=page.locator('#move-source').text_content()
  assert isinstance(latency,str) and source=='policy' and float(latency.removesuffix(' ms'))>0
  checks.append({'actual9MQueuedReply':page.locator('#moves').inner_text(),'latency':latency,'source':source})
  page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
  pocket_id=page.locator('#model option').evaluate_all("items=>items.find(x=>x.value.startsWith('pocket')).value")
  page.select_option('#model',pocket_id) # terminate next inference before closing
  assert not errors,errors
  browser.close()
 server.shutdown()
 final_hashes={n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in SOURCES}
 assert final_hashes==source_hashes, 'UI source changed during verification'
 receipt={'checks':checks,'geometry':geometry,'pageErrors':errors,'sources':source_hashes,'sourceDrift':False,'previewManifestSHA256':hashlib.sha256((PREVIEW/'models/manifest.json').read_bytes()).hexdigest(),'previewWorkerSHA256':hashlib.sha256((PREVIEW/'worker.mjs').read_bytes()).hexdigest(),'screenshots':['desktop.png','desktop-queued.png','mobile-390.png']}
 (OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
