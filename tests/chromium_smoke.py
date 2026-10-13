from pathlib import Path
import os
from playwright.sync_api import sync_playwright

JS = (Path(__file__).resolve().parents[1] / 'chatgpt-pro-quota-ledger.user.js').read_text(encoding='utf-8')

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    b = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    network_attempts = []
    ctx.route('**/*', lambda route: (network_attempts.append(route.request.url), route.abort()))
    page = ctx.new_page()
    page.set_content('<html><head><title>Local test</title></head><body><main>Offline simulated chat page</main></body></html>')
    page.evaluate("""() => { const data=new Map(); const local = {getItem:k=>data.has(k)?data.get(k):null, setItem:(k,v)=>data.set(k,String(v)), removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]||null, get length(){return data.size;}}; Object.defineProperty(window,'localStorage',{value:local,configurable:true}); }""")
    page.evaluate('''() => {
      const p = 'local_chatgpt_pro_quota_ledger_v2:Default:';
      const now = Date.now();
      const anchor = now + 48 * 3600000 - 7 * 24 * 3600000;
      localStorage.setItem(p + 'status:confirmed',JSON.stringify({kind:'reset',at:anchor,until:new Date(anchor).toISOString()}));
      for (let i=0;i<38;i++) localStorage.setItem(p + 'event:test-' + i,
        JSON.stringify({id:'test-'+i,type:'auto',at:now-1000+i,model:'gpt-6-pro',tab:'other-tab'}));
    }''')
    page.add_script_tag(content=JS)
    page.locator('[data-action="toggle"]').click()
    card = page.locator('#card')
    assert '12/50 remaining' in card.inner_text(), card.inner_text()
    assert '≈6 uses/day' in card.inner_text(), card.inner_text()
    page.locator('[data-action="settings"]').click()
    select = page.locator('#pql-quota-choice')
    old = select.element_handle()
    assert old is not None
    select.click()
    assert old.evaluate('(el) => el.isConnected'), 'Dropdown element detached by its own click'
    page.wait_for_timeout(250)
    assert old.evaluate('(el) => el.isConnected'), 'Dropdown element detached after click'
    page.evaluate('''() => window.dispatchEvent(new StorageEvent('storage', {key:'local_chatgpt_pro_quota_ledger_v2:Default:limit'}))''')
    assert old.evaluate('(el) => el.isConnected'), 'Dropdown detached by cross-tab storage event while focused'
    select.select_option('200')
    assert '162/200 remaining' in card.inner_text(), card.inner_text()
    assert page.evaluate('localStorage.getItem("local_chatgpt_pro_quota_ledger_v2:Default:limit")') == '200'
    page.locator('[data-action="info"]').click()
    assert 'How these numbers work' in card.inner_text()
    # Inferred date remains 48h projected even after a manual override.
    assert '≈81 uses/day' in card.inner_text(), card.inner_text()
    assert not network_attempts, 'Offline fixture attempted network access'
    print('CHROMIUM_SMOKE_PASS: native select stayed attached through click and storage refresh; selection changed quota; daily budget and info panel render.')
    b.close()
