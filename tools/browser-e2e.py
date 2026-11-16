"""Actual-weight browser integration, works on local or GitHub Pages origins."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:4187/')
parser.add_argument('--output', default='evaluation/play/browser-local.json')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
bound_paths = ['public/index.html','public/app.mjs','public/worker.mjs','public/style.css','public/models/manifest.json','src/engine.mjs','src/network.mjs','laptop/cli.mjs','laptop/protocol.mjs','src/opening-book.mjs','public/openings.json','tools/browser-e2e.py']
source_hashes = {name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in bound_paths}
binary = os.environ.get('ASTRA_CHROMIUM')
if not binary:
    candidates = sorted((Path.home()/'.cache/ms-playwright').glob('chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
    if candidates:
        binary = str(candidates[-1])
(root/args.output).parent.mkdir(parents=True,exist_ok=True)
checks = []
errors = []
start_fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({'executable_path':binary} if binary else {}))
    page = browser.new_page(viewport={'width':1280,'height':1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url, wait_until='networkidle')
    assert page.title() == 'Chess Lab — Chess workspace'
    assert page.locator('#book').is_checked()
    page.uncheck('#book')
    page.wait_for_selector('#model-downloads a')
    assert page.locator('#board button').count() == 64
    ids=[model['id'] for model in json.loads((root/'public/models/manifest.json').read_text())['models']]
    assert page.locator('#model option').evaluate_all('(options)=>options.map(o=>o.value)') == ids
    assert 'proposed, not built' in page.locator('#size-proposals').inner_text()
    assert page.evaluate("[...document.querySelectorAll('[aria-labelledby]')].every(el=>el.getAttribute('aria-labelledby').split(/\\s+/).every(id=>document.getElementById(id)))")
    checks.append(f'{len(ids)} actual models exposed; future size proposals not selectable')
    checks.append('64-square board and manifest loaded')
    # A seeded book response must agree with the laptop path, without invented scores.
    for seed in ('browser-book', 'second-branch', 'third-branch'):
        expected = json.loads(subprocess.check_output(['node','laptop/cli.mjs','--model','pocket','--book','--seed',seed,'--fen',start_fen],cwd=root))
        actual = page.evaluate('''async ({seed,fen}) => {
          const worker=new Worker(new URL('./worker.mjs',location.href),{type:'module'});
          return await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>{worker.terminate();reject(new Error('book timeout'))},60000);
            worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(new Error(e.message));};
            worker.onmessage=({data})=>{
              if(data.type==='error'){clearTimeout(timeout);worker.terminate();reject(new Error(data.error));}
              else if(data.type==='loaded')worker.postMessage({type:'move',id:'book-move',fen});
              else if(data.type==='move'){clearTimeout(timeout);worker.terminate();resolve(data);}
            };worker.postMessage({type:'load',id:'book-load',modelId:'pocket',book:{enabled:true,seed}});
          });
        }''', {'seed':seed,'fen':start_fen})
        assert actual['source']==expected['source']=='book'
        assert actual['move']==expected['move'] and actual['candidates']==expected['candidates']
        assert all('score' not in candidate for candidate in actual['candidates'])
        checks.append({'seededBookNodeParity':seed,'move':actual['move']})
    # Cross-runtime agreement exercises the actual worker, binary parsing and engine.
    for model in ids:
        expected = json.loads(subprocess.check_output(['node','laptop/cli.mjs','--model',model,'--no-book','--fen',start_fen], cwd=root))
        result = page.evaluate('''async ({model,fen}) => {
          const worker=new Worker(new URL('./worker.mjs',location.href),{type:'module'});
          return await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'))},60000);
            worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(new Error(e.message));};
            worker.onmessage=({data})=>{
              if(data.type==='error'){clearTimeout(timeout);worker.terminate();reject(new Error(data.error));}
              else if(data.type==='loaded')worker.postMessage({type:'move',id:'actual-move',fen});
              else if(data.type==='move'){clearTimeout(timeout);worker.terminate();resolve(data);}
            }; worker.postMessage({type:'load',id:'actual-load',modelId:model,book:{enabled:false,seed:'evaluation'}});
          });
        }''', {'model':model,'fen':start_fen})
        assert result['move'] == expected['move']
        assert result['candidates'] == expected['candidates']
        checks.append({'workerNodeParity':model,'move':result['move'],'browserInferenceMs':result['elapsedMs']})
        page.select_option('#model',model)
        page.select_option('#time-control','unlimited')
        page.click('#new-game')
        page.wait_for_function("document.querySelector('#status').textContent === 'Your move'")
        page.click('[data-square="e2"]'); page.click('[data-square="e4"]')
        page.wait_for_function("document.querySelectorAll('.move-san').length === 2 && document.querySelector('#status').textContent === 'Your move'")
        assert page.locator('#candidates .candidate').count() > 0
        checks.append(f'{model}: human e4 and real-weight reply')
    page.screenshot(path=str((root/args.output).with_suffix('.desktop.png')),full_page=True)
    page.select_option('#color','b'); page.click('#new-game')
    page.wait_for_function("document.querySelectorAll('.move-san').length === 1 && document.querySelector('#status').textContent === 'Your move'")
    assert page.locator('#board button').first.get_attribute('data-square') == 'h1'
    checks.append('human Black, real-weight opening, flipped board')
    page.select_option('#color','w'); page.select_option('#model','pocket-plus')

    def load_fen(fen, status='Your move'):
        page.fill('#fen',fen); page.click('#fen-form button')
        page.wait_for_function('(text)=>document.querySelector("#status").textContent.includes(text)',arg=status)

    for model in ('pocket-plus','atlas-plus','pocket-tuned','atlas-tuned','pocket-policy','atlas-policy'):
        page.select_option('#model',model);page.select_option('#color','b')
        load_fen('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1','Checkmate')
        checks.append(f'{model}: actual neural mating choice finishes game')
    page.select_option('#color','w');page.select_option('#model','pocket-plus')

    load_fen('7k/P7/8/8/8/8/8/6K1 w - - 0 1')
    page.click('[data-square="a7"]'); page.click('[data-square="a8"]')
    page.wait_for_selector('#promotion-dialog[open]')
    page.click('[data-promotion="n"]')
    page.wait_for_function("document.querySelector('#status').textContent.includes('insufficient material')")
    assert 'White knight' in page.locator('[data-square="a8"]').get_attribute('aria-label')
    checks.append('human underpromotion and insufficient-material draw')
    with page.expect_download() as downloaded:
        page.click('#download-pgn')
    text = Path(downloaded.value.path()).read_text()
    assert 'a8=N' in text and '[Result "1/2-1/2"]' in text
    checks.append('downloaded PGN contains promotion and result')

    load_fen('k7/p7/8/8/8/8/8/4K2R w K - 0 1')
    page.click('[data-square="e1"]'); page.click('[data-square="g1"]')
    page.wait_for_function("document.querySelectorAll('.move-san').length >= 2")
    assert 'White rook' in page.locator('[data-square="f1"]').get_attribute('aria-label')
    assert 'White king' in page.locator('[data-square="g1"]').get_attribute('aria-label')
    checks.append('castling moves king and rook')
    load_fen('6k1/8/8/3pP3/8/8/8/6K1 w - d6 0 1')
    page.click('[data-square="e5"]'); page.click('[data-square="d6"]')
    page.wait_for_function("document.querySelectorAll('.move-san').length >= 2")
    assert 'empty' in page.locator('[data-square="d5"]').get_attribute('aria-label')
    assert 'White pawn' in page.locator('[data-square="d6"]').get_attribute('aria-label')
    checks.append('en passant removes captured pawn')
    load_fen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1','Checkmate')
    checks.append('terminal FEN stops game without policy move')
    page.select_option('#time-control','custom')
    page.fill('#custom-minutes','0.05'); page.fill('#custom-increment','0'); page.click('#new-game')
    page.wait_for_function("document.querySelector('#status').textContent.includes('ran out of time')",timeout=15000)
    assert page.locator('#human-clock').inner_text()=='0:00'
    checks.append('real three-second clock flag fall')
    page.set_viewport_size({'width':390,'height':844})
    page.select_option('#time-control','unlimited'); page.click('#new-game')
    page.wait_for_function("document.querySelector('#status').textContent === 'Your move'")
    page.click('[data-square="d2"]'); page.click('[data-square="d4"]')
    page.wait_for_function("document.querySelectorAll('.move-san').length === 2")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str((root/args.output).with_suffix('.mobile.png')),full_page=True)
    checks.append('390px mobile board play without horizontal overflow')
    assert not errors, errors
    assert source_hashes == {name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in bound_paths}, 'Inputs changed during browser suite'
    receipt={'url':args.url,'browser':browser.version,'checks':checks,'pageErrors':errors,'sourceHashes':source_hashes}
    browser.close()
output=root/args.output
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
