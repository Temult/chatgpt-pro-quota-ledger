"""Capture the real userscript on a synthetic page; never capture a user's chat."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'chatgpt-pro-quota-ledger.user.js').read_text(encoding='utf-8')
HTML = '''<!doctype html><meta charset="utf-8"><title>Synthetic Pro ledger demonstration</title>
<style>
body{margin:0;background:#101011;color:#eae5ef;font-family:system-ui,sans-serif}
.caption{position:absolute;top:23px;left:28px;font-size:14px;color:#a69aac}
.menu{position:absolute;left:108px;top:224px;width:470px;height:148px;border-radius:24px;background:#303031}
#selected-label{position:absolute;top:23px;left:202px;font-size:26px;font-weight:650;color:#b888ff}
.track{position:absolute;left:23px;top:88px;width:424px;height:38px;border-radius:25px;
background:linear-gradient(110deg,#7485ff,#aa7bed,#7755c9)}
.thumb{position:absolute;right:0;top:-4px;height:46px;width:46px;border-radius:50%;background:white;box-shadow:0 0 0 1px #d1c6e1}
.tick{font-size:14px;letter-spacing:46px;padding-left:20px;color:#d7cefa;line-height:37px}
</style><div class="caption">Pro Quota Ledger · synthetic demonstration</div>
<div class="menu" role="menu"><div id="selected-label">Pro</div>
<div class="track" role="menuitem" data-reasoning-slider="true" aria-label="Power"><span class="tick">· · · ·</span><span class="thumb"></span></div></div>'''
with sync_playwright() as p:
    exe = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = p.chromium.launch(headless=True, executable_path=exe, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':680,'height':410},device_scale_factor=1.5)
    attempted=[]
    context.route('**/*',lambda route:(attempted.append(route.request.url),route.abort()))
    page = context.new_page()
    page.set_content(HTML)
    page.evaluate('''() => {
      const values=new Map();
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),
        removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}}});
      const p='local_chatgpt_pro_quota_ledger_v2:Default:'; const now=Date.now();
      localStorage.setItem(p+'display-mode','picker');
      const anchor=now+48*3600000-7*86400000;
      localStorage.setItem(p+'status:synthetic',JSON.stringify({kind:'reset',at:anchor,until:new Date(anchor).toISOString()}));
      for(let i=0;i<12;i++)localStorage.setItem(p+'event:synthetic-'+i,JSON.stringify({
        id:'synthetic-'+i,type:'auto',at:now-1000+i,model:'gpt-6-pro',tab:'synthetic'}));
    }''')
    page.add_script_tag(content=JS)
    badge=page.locator('#chatgpt-pro-quota-ledger-inline-host .badge')
    badge.wait_for(state='visible')
    assert badge.inner_text()=='38/50'
    badge.hover()
    page.locator('#chatgpt-pro-quota-ledger-inline-host [role="tooltip"]').wait_for(state='visible')
    page.screenshot(path=str(ROOT/'docs/images/picker-demo.png'))
    assert not attempted
    context.close();browser.close()
    print('Captured synthetic documentation image; no account data used')
