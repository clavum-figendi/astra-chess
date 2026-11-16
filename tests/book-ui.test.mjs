import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('actual browser book works under subpath, neutral UI, fresh seeds, PGN, toggle and policy fallback', {skip:!process.env.ASTRA_BROWSER_TESTS},()=>{
 const script=String.raw`
import json,threading,os,subprocess
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
root=Path.cwd()
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  path=path.split('?')[0].removeprefix('/chess/')
  if path=='src/chess.mjs': return str(root/'node_modules/chess.js/dist/esm/chess.js')
  if path.startswith('src/'): return str(root/path)
  return str(root/'public'/('index.html' if not path else path))
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 binary=os.environ.get('ASTRA_CHROMIUM') or str(sorted((Path.home()/'.cache/ms-playwright').glob('chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))[-1])
 browser=p.chromium.launch(headless=True,executable_path=binary,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':1000},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:'+str(server.server_port)+'/chess/',wait_until='networkidle')
 assert page.title()=='Chess Lab — Chess workspace'
 assert 'Astra' not in page.locator('body').inner_text() and 'Sol-assisted' not in page.locator('body').inner_text()
 assert page.locator('#book').is_checked()
 page.select_option('#time-control','unlimited');page.select_option('#color','b')
 def start():
  page.click('#new-game');page.wait_for_function("document.querySelector('#status').textContent==='Your move' && document.querySelectorAll('.move-san').length===1")
 def pgn():
  with page.expect_download() as d:page.click('#download-pgn')
  return Path(d.value.path()).read_text()
 start();assert page.locator('#move-source').inner_text()=='book'
 assert page.locator('.candidate-score').count()==0
 first=pgn(); assert '[Book "on"]' in first and '[Seed "' in first
 start();second=pgn();assert first.split('[Seed "')[1].split('"')[0]!=second.split('[Seed "')[1].split('"')[0]
 page.uncheck('#book');start();assert page.locator('#move-source').inner_text()=='policy'
 assert page.locator('.candidate-score').count()>0
 assert '[Book "off"]' in pgn()
 page.check('#book')
 page.fill('#fen','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 20');page.click('#fen-form button')
 page.wait_for_function("document.querySelector('#status').textContent==='Your move'")
 assert page.locator('#move-source').inner_text()=='policy'
 page.fill('#fen','rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1');page.click('#fen-form button')
 page.wait_for_function("document.querySelector('#status').textContent==='Your move'")
 assert page.locator('#move-source').inner_text()=='policy','import must not normalize EP into a book hit'
 page.fill('#fen','7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');page.click('#fen-form button')
 page.wait_for_function("document.querySelector('#status').textContent.includes('Checkmate')")
 assert page.locator('#move-source').inner_text()=='—'
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close()
server.shutdown()
print('Actual worker/book/policy/subpath/UI/PGN/seed checks passed')
`;
 const result=spawnSync(process.env.PYTHON||'python',['-c',script],{cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:120000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
