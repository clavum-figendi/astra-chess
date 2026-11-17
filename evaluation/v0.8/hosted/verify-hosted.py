"""Verify deployed V8 bytes and real local-policy play; no model fitting."""
import concurrent.futures, hashlib, json, os, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path('/home/hermes/projects/astra-chess')
DIST=ROOT/'dist'
OUT=ROOT/'.cache/v8/hosted'
BASE='https://clavum-figendi.github.io/chesslab/'
CHROME='/home/hermes/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'
def sha(data): return hashlib.sha256(data).hexdigest()
def get(path):
    with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'Cache-Control':'no-cache'}),timeout=90) as response:
        return response.read(),response.headers.get('Content-Type','')
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    paths=[p for p in DIST.rglob('*') if p.is_file() and p.relative_to(DIST).parts[0] not in {'docs','evaluation','downloads'}]
    paths += [DIST/'docs/RELEASE-V8.md',DIST/'downloads/astra-chess-laptop.zip',DIST/'evaluation/v0.8/review-spec-completion.json',DIST/'evaluation/v0.8/review-model-quality-final.json']
    expected={str(p.relative_to(DIST)):sha(p.read_bytes()) for p in paths}
    (OUT/'expected-assets.json').write_text(json.dumps(expected,indent=2)+'\n')
    def check(item):
        path,want=item;data,kind=get(path);assert sha(data)==want,path
        return {'path':path,'sha256':want,'bytes':len(data),'contentType':kind}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: assets=list(pool.map(check,expected.items()))
    assert len(assets)==len(expected)==len({x['path'] for x in assets})
    (OUT/'assets.json').write_text(json.dumps(assets,indent=2)+'\n')
    mapping=json.loads((DIST/'evaluation/HTML-EVIDENCE.json').read_text())
    inert=[]
    for entry in mapping['files']:
        data,kind=get('evaluation/'+entry['published'])
        assert sha(data)==entry['sha256'] and 'text/plain' in kind,(entry,kind)
        try: get('evaluation/'+entry['original'])
        except urllib.error.HTTPError as e: assert e.code==404
        else: raise AssertionError('Raw HTML served')
        inert.append(entry['published'])
    manifest=json.loads((DIST/'models/manifest.json').read_text())['models']
    books=json.loads((DIST/'books/manifest.json').read_text())['books']
    active={m['file'] for m in manifest}
    retired=[]
    for model in json.loads((ROOT/'public/models/manifest.json').read_text())['models']:
        if model['file'] in active: continue
        try: get('models/'+model['file'])
        except urllib.error.HTTPError as e: assert e.code==404
        else: raise AssertionError('Retired binary still served: '+model['file'])
        retired.append(model['file'])
    errors=[];checks=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--no-sandbox'])
        version=browser.version
        context=browser.new_context(viewport={'width':1280,'height':1050},accept_downloads=True)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle')
        page.wait_for_function("document.querySelector('#book-source').options.length===3")
        assert page.locator('#model option').evaluate_all('(es)=>es.map(e=>e.value)')==[m['id'] for m in manifest]
        page.select_option('#time-control','unlimited');page.select_option('#color','b')
        def start():
            page.click('#new-game')
            page.wait_for_function("document.querySelector('#status').textContent==='Your move' && document.querySelectorAll('.move-san').length===1",timeout=120000)
        page.select_option('#model','pocket-plus')
        for book in books:
            page.select_option('#book-source',book['id']);start()
            assert page.locator('#move-source').text_content()=='book'
            with page.expect_download() as d: page.click('#download-pgn')
            text=Path(d.value.path()).read_text()
            assert f'[BookSource "{book["id"]}"]' in text and f'[BookHash "{book["sha256"]}"]' in text
            checks.append({'book':book['id'],'move':page.locator('.move-san').text_content(),'pgnProvenance':True})
        page.uncheck('#book')
        for model in manifest:
            page.select_option('#model',model['id']);start()
            assert page.locator('#move-source').text_content()=='policy'
            checks.append({'model':model['id'],'book':False,'move':page.locator('.move-san').text_content()})
        page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
        assert not errors,errors
        browser.close()
    receipt={'url':BASE,'sourceCommit':'b7074158d60ee126cf93b2f482390ccfc0628705','pagesCommit':'1062bcbca788a3b2dd2db18cbb7581ba5ee9674a','browserVersion':version,'assets':assets,'inertEvidence':inert,'retired404':retired,'checks':checks,'pageErrors':errors,'scriptSHA256':sha(Path(__file__).read_bytes()),'screenshots':{p.name:sha(p.read_bytes()) for p in OUT.glob('*.png')},'scope':'Live HTTP bytes match final build; real hosted browser exercises three books and all three searchless policies. Not Elo or cross-browser certification.'}
    (OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'verifiedAssets':len(assets),'inertEvidence':len(inert),'retired404':len(retired),'browserChecks':checks,'errors':errors},indent=2))
if __name__=='__main__': main()
