"""Exercise packaged or hosted transformer through the real UI and worker."""
import argparse,hashlib,http.server,json,threading,time,statistics
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CHROME='/home/hermes/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell'
def main():
 p=argparse.ArgumentParser();p.add_argument('--url');p.add_argument('--count',type=int,default=147);p.add_argument('--output',default='evaluation/v0.6/browser-integrated.json');args=p.parse_args()
 server=None
 if not args.url:
  class Handler(http.server.SimpleHTTPRequestHandler):
   def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
   def log_message(self,*a):pass
  server=http.server.ThreadingHTTPServer(('127.0.0.1',4194),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();args.url='http://127.0.0.1:4194/dist/'
 rows=json.loads((ROOT/'.cache/deepmind-v5/test.json').read_text())[:args.count]
 reference={x['id']:x for x in json.loads((ROOT/'evaluation/v0.5/final-results.json').read_text())['positions']['adapted']}
 errors=[];answers=[];requests=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=CHROME,headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1280,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.goto(args.url);page.wait_for_selector('#model option[value="deepmind-9m"]',state='attached')
  page.select_option('#model','deepmind-9m');page.select_option('#color','b');page.select_option('#time-control','unlimited');page.uncheck('#book');page.click('#new-game')
  page.wait_for_function("document.getElementById('status').textContent.startsWith('Your move')",timeout=120000)
  assert page.locator('#move-source').inner_text()=='policy';assert page.locator('#score-label').inner_text()=='Expected return'
  ui={'notation':page.locator('#moves').inner_text(),'latency':page.locator('#latency').inner_text()}
  page.select_option('#model','pocket');assert 'Settings changed' in page.locator('#status').inner_text()
  # Actual worker protocol, book-off: no Node/Python inference substitution.
  page.evaluate('''() => {window.probeWorker=new Worker(new URL('worker.mjs',location.href),{type:'module'});window.probeSequence=0;window.probePending=new Map();window.probeWorker.onmessage=({data})=>{const p=window.probePending.get(data.id);if(p){window.probePending.delete(data.id);data.type==='error'?p.reject(new Error(data.error)):p.resolve(data);}};window.callProbe=(data)=>new Promise((resolve,reject)=>{const id='probe:'+ ++window.probeSequence;window.probePending.set(id,{resolve,reject});window.probeWorker.postMessage({...data,id});});}''')
  metadata=page.evaluate("() => window.callProbe({type:'load',modelId:'deepmind-9m',book:{enabled:false,seed:'verification'}})")['metadata']
  for n,row in enumerate(rows):
   result=page.evaluate("fen => window.callProbe({type:'move',fen})",row['fen'])
   assert result['move'] in row['legal'];assert result['source']=='policy'
   assert len(result['candidates'])>0
   answers.append({'id':row['id'],'move':result['move'],'referenceMove':reference[row['id']]['move'],'teacher':row['bestmove'],'elapsedMs':result['elapsedMs']})
   if (n+1)%20==0:print('Browser positions',n+1,flush=True)
  # Opening book remains separate and works with the transformer selected.
  page.evaluate("() => window.callProbe({type:'load',modelId:'deepmind-9m',book:{enabled:true,seed:'verification'}})")
  book=page.evaluate("() => window.callProbe({type:'move',fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'})")
  assert book['source']=='book'
  page.evaluate('window.probeWorker.terminate()')
  page.screenshot(path=str(ROOT/'evaluation/v0.6/browser-integrated.png'),full_page=True)
  browser.close()
 if server:server.shutdown()
 assert not errors,errors
 receipt={'url':args.url,'metadata':metadata,'ui':ui,'positions':answers,'referenceAgreements':sum(a['move']==a['referenceMove'] for a in answers),'teacherHits':sum(a['move']==a['teacher'] for a in answers),'positionsCount':len(answers),'medianMs':statistics.median(a['elapsedMs'] for a in answers),'maxMs':max(a['elapsedMs'] for a in answers),'bookMove':book['move'],'pageErrors':errors,'runtimeRequests':sorted(set(u for u in requests if '/vendor/' in u)),'browser':'Chromium headless, CPU WASM, one thread','sources':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['public/app.mjs','public/worker.mjs','src/transformer.mjs','src/model-resource.mjs','tools/build.mjs']}}
 (ROOT/args.output).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k not in ['positions','sources','metadata']}))
if __name__=='__main__':main()
