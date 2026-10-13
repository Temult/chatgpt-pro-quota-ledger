"""Offline Chromium tests for one-click picker menu actions and temporary settings.
Never connects to ChatGPT and makes no network requests.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
JS=(ROOT/'chatgpt-pro-quota-ledger.user.js').read_text(encoding='utf-8')
PFX='local_chatgpt_pro_quota_ledger_v2:Default:'
MENU = '''<div role="menu" id="native-picker" style="position:fixed;top:230px;left:320px;width:460px;height:144px;z-index:5;background:#333;color:#fff">
 <div id="selected-label" style="position:absolute;top:22px;left:165px;font-size:25px">Pro</div>
 <div role="menuitem" data-reasoning-slider="true" style="position:absolute;left:20px;top:78px;width:415px;height:35px;background:#805fe4"><span>Instant Medium High Extra High Pro</span></div>
 </div>'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1100,'height':770})
    network_attempts = []
    context.route('**/*', lambda route: (network_attempts.append(route.request.url), route.abort()))
    page=context.new_page()
    page.set_default_timeout(4500)
    page.set_content('<html><body><main>Offline test page</main><div id="picker-target"></div></body></html>')
    page.evaluate('''() => {
      const values=new Map();
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>values.has(k)?values.get(k):null,
        setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),
        key:i=>[...values.keys()][i]??null,get length(){return values.size}
      }});
      localStorage.setItem('local_chatgpt_pro_quota_ledger_v2:Default:display-mode','picker');
      for(let i=0;i<12;i++)localStorage.setItem(
        'local_chatgpt_pro_quota_ledger_v2:Default:event:seed'+i,
        JSON.stringify({id:'seed'+i,type:'auto',at:Date.now()-1000,tab:'prior',model:'gpt-6-pro'}));
    }''')
    page.add_script_tag(content=JS)
    page.evaluate('(html)=>document.querySelector("#picker-target").innerHTML=html',MENU)
    badge=page.locator('#chatgpt-pro-quota-ledger-inline-host [data-action="inline-toggle"]')
    quick=page.locator('#chatgpt-pro-quota-ledger-quick-host [aria-label="Counter display options"]')
    panel=page.locator('#chatgpt-pro-quota-ledger-host')
    badge.wait_for(state='visible')
    assert not panel.is_visible()
    count0=page.evaluate("() => Array.from({length:localStorage.length}, (_,i)=>localStorage.key(i)).filter(k=>k.includes(':event:')).length")

    # First click must work even if the native picker dismisses on pointerdown.
    badge.click()
    quick.wait_for(state='visible')
    page.evaluate('''() => document.addEventListener('pointerdown',e=>{
      const native=document.querySelector('#native-picker');
      if(native && !native.contains(e.target))native.remove();
    },true)''')
    page.locator('[data-action="inline-settings"]').click()
    page.locator('#pql-settings-panel').wait_for(state='visible')
    assert page.evaluate(f"localStorage.getItem('{PFX}display-mode')")=='picker', 'full settings must not force both'
    assert page.locator('#card').get_by_text('Temporary settings view',exact=False).count()
    page.locator('#chatgpt-pro-quota-ledger-host [data-action="toggle"]').click()
    assert not panel.is_visible(),'temporary tray should vanish after closing picker-only settings'
    assert page.evaluate(f"localStorage.getItem('{PFX}display-mode')")=='picker'

    # Reopen the native Power menu between interactions, as a user would.
    def reopen_picker():
        page.evaluate('(html)=>{if(!document.querySelector("#native-picker"))document.querySelector("#picker-target").innerHTML=html}',MENU)
        badge.wait_for(state='visible',timeout=4500)
    # Test all choices with SINGLE clicks.
    reopen_picker()
    badge.wait_for(state='visible')
    badge.click()
    page.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="both"]').click()
    assert page.evaluate(f"localStorage.getItem('{PFX}display-mode')")=='both'
    assert panel.is_visible()
    # Rapid subsequent mode switches must not demand another click to commit.
    reopen_picker()
    badge.wait_for(state='visible')
    badge.click()
    page.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="picker"]').click()
    assert page.evaluate(f"localStorage.getItem('{PFX}display-mode')")=='picker'
    assert not panel.is_visible()

    reopen_picker()
    # From picker only open temporary settings, select an explicit new mode,
    # and close: the deliberate selection persists, not the pre-visit mode.
    badge.click()
    page.locator('#chatgpt-pro-quota-ledger-quick-host [data-action="inline-settings"]').click()
    page.locator('#pql-display-choice').select_option('both')
    assert page.evaluate(f"localStorage.getItem('{PFX}display-mode')")=='both'
    page.locator('#chatgpt-pro-quota-ledger-host [data-action="toggle"]').click()
    assert panel.is_visible(), 'explicit Both selection persists after temporary settings close'
    assert page.locator('#chatgpt-pro-quota-ledger-host [data-action="toggle"]').is_visible()

    reopen_picker()
    # Keyboard selection still works when pointerdown handler is active.
    badge.click()
    button=page.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="picker"]')
    button.focus()
    page.keyboard.press('Enter')
    assert page.evaluate(f"localStorage.getItem('{PFX}display-mode')")=='picker'
    assert not panel.is_visible()
    count1=page.evaluate("() => Array.from({length:localStorage.length}, (_,i)=>localStorage.key(i)).filter(k=>k.includes(':event:')).length")
    assert count0==count1==12,'new controls must not mutate usage history'
    assert not network_attempts, 'Offline fixture attempted network access'
    print('CHROMIUM_QUICK_ACTIONS_PASS: single-click menu choices; picker-only temporary full settings; explicit override; keyboard; ledger retained')
    context.close();browser.close()
