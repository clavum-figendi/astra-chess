// Optional real-browser contracts: ASTRA_BROWSER_TESTS=1 node --test tests/clock-ui.test.mjs
// Requires Python Playwright and its Chromium installation; no network access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const setup = String.raw`
import json, threading, functools, os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
root = Path.cwd()
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self, path):
  path = path.split('?')[0]
  if path == '/src/chess.mjs': return str(root / 'node_modules/chess.js/dist/esm/chess.js')
  return str(root / path.lstrip('/')) if path.startswith('/src/') else str(root / 'public' / ('index.html' if path == '/' else path.lstrip('/')))
 def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
 browser = p.chromium.launch(headless=True, executable_path=os.environ.get('ASTRA_CHROMIUM'), args=['--no-sandbox'])
 page = browser.new_page(viewport={'width':1280,'height':900})
 page.route('**/models/manifest.json', lambda route: route.fulfill(json={'models':[{'id':'pocket','name':'Pocket','file':'pocket.bin','bytes':1000,'parameters':100,'neurons':20}]}))
 page.route('**/worker.mjs', lambda route: route.fulfill(content_type='text/javascript', body="onmessage=({data:d})=>{if(d.type==='load')postMessage({type:'loaded',id:d.id,modelId:d.modelId});else postMessage({type:'move',id:d.id,move:'e7e5',candidates:[{move:'e7e5',score:2}],elapsedMs:1.5})}"))
 page.goto('http://127.0.0.1:'+str(server.server_port))
 page.uncheck('#book')
`;
function browserContract(script) {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', setup + script], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

test('workspace renders 64 accessible squares, neutral identity, and starts only on request', { skip: !process.env.ASTRA_BROWSER_TESTS }, () => {
  browserContract(String.raw`
 page.wait_for_selector('button[data-square="e2"]')
 assert page.locator('button[data-square]').count() == 64
 assert page.title() == 'Chess Lab — Chess workspace'
 assert 'Sol-assisted' not in page.locator('body').inner_text()
 assert page.locator('#book').count() == 1
 assert page.locator('a[href="./docs/OPTIMIZATION-V3.md"]').count() == 1
 assert page.locator('#status').inner_text() == 'Settings changed · start a new game'
 page.locator('#new-game').click()
 page.wait_for_function("document.querySelector('#status').textContent.includes('Your move')")
 page.locator('[data-square="e2"]').press('Enter')
 assert page.locator('[data-square="e4"]').get_attribute('class').find('legal') >= 0
 page.locator('[data-square="e4"]').press('Enter')
 page.wait_for_function("document.querySelector('#moves').textContent.includes('e5')")
 assert 'e4' in page.locator('#moves').inner_text()
 assert '1.50' in page.locator('#latency').inner_text()
 if os.environ.get('ASTRA_SCREENSHOT'): page.screenshot(path=os.environ['ASTRA_SCREENSHOT'], full_page=True)
 browser.close()
`);
});

test('black-side play, keyboard navigation, and reset cancel an outstanding decision', { skip: !process.env.ASTRA_BROWSER_TESTS }, () => {
  browserContract(String.raw`
 page.route('**/worker.mjs', lambda route: route.fulfill(content_type='text/javascript', body="onmessage=({data:d})=>{if(d.type==='load')postMessage({type:'loaded',id:d.id,modelId:d.modelId});else setTimeout(()=>postMessage({type:'move',id:d.id,move:'e2e4',candidates:[],elapsedMs:2}),250)}"))
 page.select_option('#color','b')
 page.locator('#new-game').click()
 page.wait_for_function("document.querySelector('#moves').textContent.includes('e4')")
 assert page.locator('#board button').first.get_attribute('data-square') == 'h1'
 page.locator('[data-square="e7"]').press('ArrowLeft')
 assert page.locator(':focus').get_attribute('data-square') == 'f7'
 page.locator('[data-square="e7"]').click()
 page.locator('[data-square="e5"]').click()
 page.locator('#new-game').click()
 page.wait_for_function("document.querySelector('#moves').textContent.includes('e4')")
 assert 'e5' not in page.locator('#moves').inner_text()
 page.locator('#resign').click()
 page.locator('#confirm-resign').click()
 assert 'Black resigned' in page.locator('#status').inner_text()
 page.wait_for_timeout(350)
 assert 'e5' not in page.locator('#moves').inner_text()
 browser.close()
`);
});

test('FEN imports allow explicit underpromotions for either color and PGN contains the result', { skip: !process.env.ASTRA_BROWSER_TESTS }, () => {
  browserContract(String.raw`
 for color, fen, origin, target in [('w','7k/P7/8/8/8/8/8/7K w - - 0 1','a7','a8'),('b','7k/8/8/8/8/8/p7/7K b - - 0 1','a2','a1')]:
  page.select_option('#color',color)
  page.locator('#fen').fill(fen)
  page.locator('#fen-form button').click()
  page.wait_for_function("document.querySelector('#status').textContent.includes('Your move')")
  page.locator('[data-square="'+origin+'"]').click()
  page.locator('[data-square="'+target+'"]').click()
  assert page.locator('#promotion-dialog').is_visible()
  assert page.locator('[data-promotion]').count() == 4
  page.locator('[data-promotion="n"]').click()
  assert 'insufficient material' in page.locator('#status').inner_text()
  assert 'knight' in page.locator('[data-square="'+target+'"]').get_attribute('aria-label')
 with page.expect_download() as download:
  page.locator('#download-pgn').click()
 text = Path(download.value.path()).read_text()
 assert '[Result "1/2-1/2"]' in text and 'a1=N' in text
 page.locator('#fen').fill('not a fen')
 page.locator('#fen-form button').click()
 assert 'Unable' not in page.locator('#status').inner_text()
 assert 'FEN' in page.locator('#status').inner_text()
 assert page.locator('button[data-square]').count() == 64
 browser.close()
`);
});

test('clock loading is untimed, AI thinking is timed, and flag fall rejects a late worker reply', { skip: !process.env.ASTRA_BROWSER_TESTS }, () => {
  browserContract(String.raw`
 page.add_init_script("window.testNow=0; performance.now=()=>window.testNow")
 page.route('**/worker.mjs', lambda route: route.fulfill(content_type='text/javascript', body="onmessage=({data:d})=>{if(d.type==='load')setTimeout(()=>postMessage({type:'loaded',id:d.id,modelId:d.modelId}),300);else setTimeout(()=>postMessage({type:'move',id:d.id,move:'e7e5',candidates:[],elapsedMs:2}),500)}"))
 page.reload()
 page.select_option('#time-control','custom')
 page.locator('#custom-minutes').fill('0.05')
 page.locator('#custom-increment').fill('0')
 page.locator('#new-game').click()
 page.evaluate("window.testNow=90000; document.dispatchEvent(new Event('visibilitychange'))")
 assert page.locator('#human-clock').inner_text() == '0:03'
 page.wait_for_function("document.querySelector('#status').textContent.includes('Your move')")
 assert page.locator('#human-clock').inner_text() == '0:03'
 page.locator('[data-square="e2"]').click()
 page.locator('[data-square="e4"]').click()
 page.evaluate("window.testNow=93001; document.dispatchEvent(new Event('visibilitychange'))")
 assert 'Black ran out of time' in page.locator('#status').inner_text()
 page.wait_for_timeout(600)
 assert 'e5' not in page.locator('#moves').inner_text()
 assert page.locator('#opponent-clock').inner_text() == '0:00'
 browser.close()
`);
});

test('mobile workspace fits without horizontal overflow', { skip: !process.env.ASTRA_BROWSER_TESTS }, () => {
  browserContract(String.raw`
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  assert page.locator('#board').bounding_box()['width'] <= width
  assert page.locator('#new-game').is_visible()
  if width == 390:
   assert page.locator('#model').bounding_box()['width'] >= 140, 'Policy selector is too narrow to read'
 if os.environ.get('ASTRA_MOBILE_SCREENSHOT'):
  page.set_viewport_size({'width':390,'height':844})
  page.screenshot(path=os.environ['ASTRA_MOBILE_SCREENSHOT'], full_page=True)
 browser.close()
`);
});
