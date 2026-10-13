"""Offline headless Chromium fixture; no ChatGPT requests or credentials.

Checks Power-slider pill, user display choices, diagnostic preview and
synthetic storage-event repaint. Actual cross-tab logic is separately tested in Node.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'chatgpt-pro-quota-ledger.user.js').read_text(encoding='utf-8')
PREFIX = 'local_chatgpt_pro_quota_ledger_v2:Default:'
HTML = '''<!doctype html><html><head><meta charset="utf-8"><title>Offline ChatGPT fixture</title></head>
<body><main><h1>Offline simulated ChatGPT</h1><button id="open-models">Power selector</button>
<section id="picker-target"></section></main></body></html>'''

with sync_playwright() as p:
    exe = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = p.chromium.launch(headless=True, executable_path=exe, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    network_attempts = []
    context.route('**/*', lambda route: (network_attempts.append(route.request.url), route.abort()))
    a = context.new_page()
    a.set_content(HTML)
    a.evaluate("""() => {
      const data = new Map();
      const local = {getItem:k=>data.has(k)?data.get(k):null,
        setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),
        key:i=>[...data.keys()][i]||null,get length(){return data.size;}};
      Object.defineProperty(window,'localStorage',{value:local,configurable:true});
    }""")
    a.add_script_tag(content=JS)
    a.locator('#chatgpt-pro-quota-ledger-host').wait_for()
    # Seed one explicit cycle anchor and twelve messages in mocked origin storage.
    a.evaluate('''() => {
      const prefix = 'local_chatgpt_pro_quota_ledger_v2:Default:';
      const anchor = Date.now() - 86400000;
      localStorage.setItem(prefix+'status:seed',JSON.stringify({kind:'reset',at:anchor,until:new Date(anchor).toISOString()}));
      for(let i=0;i<12;i++) localStorage.setItem(prefix+'event:seed'+i,
        JSON.stringify({id:'seed'+i,at:Date.now()-1000+i,tab:'prior',type:'auto',model:'gpt-6-pro'}));
    }''')
    a.locator('#chatgpt-pro-quota-ledger-host [data-action="toggle"]').click()
    a.get_by_text('38/50 remaining', exact=True).wait_for(timeout=5000)
    # Emulate actual native menu structure from the user screenshot:
    # selected effort is shown ABOVE a 5-stop slider. All stop names,
    # including Pro, remain present inside the slider even while High selected.
    a.evaluate('''() => document.querySelector('#picker-target').innerHTML =
      '<div role="menu" style="position:fixed;left:330px;top:150px;width:470px;height:152px;border-radius:24px;background:#303030;color:white;z-index:10">'+
      '<div id="selected-label" style="position:absolute;top:25px;left:185px;font-size:25px;font-weight:700">Pro</div>'+
      '<div role="menuitem" data-reasoning-slider="true" aria-label="Power" '+
      'style="position:absolute;top:87px;left:22px;width:426px;height:33px;border-radius:22px;background:#836de8">'+
      '<span style="position:absolute;left:0;top:40px">Instant · Medium · High · Extra High · Pro</span></div></div>';''')
    badge=a.locator('#chatgpt-pro-quota-ledger-inline-host [data-action="inline-toggle"]')
    badge.wait_for(state='visible',timeout=5000)
    assert badge.inner_text()=='38/50', badge.inner_text()
    # High may show "Pro" as an available STOP, but the badge must not appear.
    a.evaluate("() => document.querySelector('#selected-label').textContent = 'High'")
    a.wait_for_timeout(180)
    assert not badge.is_visible(), 'High selected must suppress the Pro pill'
    # The selected heading can include a native chevron as text.
    a.evaluate("() => document.querySelector('#selected-label').textContent = 'Pro ›'")
    badge.wait_for(state='visible',timeout=5000)
    a.evaluate("() => document.querySelector('#selected-label').textContent = 'Pro'")
    pos=a.evaluate("""() => {
      const native=document.querySelector('#selected-label').getBoundingClientRect();
      const pill=document.querySelector('#chatgpt-pro-quota-ledger-inline-host').getBoundingClientRect();
      const menu=document.querySelector('[role=menu]').getBoundingClientRect();
      return {nativeTop:native.top,nativeBottom:native.bottom,nativeRight:native.right,
        pillTop:pill.top,pillBottom:pill.bottom,pillLeft:pill.left,pillRight:pill.right,menuRight:menu.right};
    }""")
    assert abs((pos['pillTop']+pos['pillBottom'])/2 - (pos['nativeTop']+pos['nativeBottom'])/2) <= 3, pos
    assert pos['pillLeft'] > pos['nativeRight'] + 8, pos
    assert pos['pillRight'] < pos['menuRight'], pos
    badge.hover()
    # The picker refresh is debounced; wait for actual hover visibility rather
    # than sampling during the native-label/overlay transition.
    a.locator('#chatgpt-pro-quota-ledger-inline-host [role="tooltip"]').wait_for(state='visible', timeout=5000)
    assert '38/50 remaining' in a.locator('#chatgpt-pro-quota-ledger-inline-host [role="tooltip"]').inner_text()
    tooltip_summary=a.locator('#chatgpt-pro-quota-ledger-inline-host [role="tooltip"]').inner_text().lower()
    assert 'estimate' not in tooltip_summary and 'local browser' not in tooltip_summary, tooltip_summary
    # The default menu has just enough headroom for this fixture's short
    # tooltip: prefer above whenever the entire card fits.
    tooltip=a.locator('#chatgpt-pro-quota-ledger-inline-host [role="tooltip"]')
    measure_js = """() => {
      const tip = document.querySelector('#chatgpt-pro-quota-ledger-inline-host').shadowRoot.querySelector('.tip');
      const badge = document.querySelector('#chatgpt-pro-quota-ledger-inline-host').shadowRoot.querySelector('.badge');
      const t = tip.getBoundingClientRect(), b = badge.getBoundingClientRect();
      return {placement:tip.dataset.placement, top:t.top,bottom:t.bottom,left:t.left,right:t.right,
        badgeTop:b.top,badgeBottom:b.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight};
    }"""
    tooltip.wait_for(state='visible')
    initial = a.evaluate(measure_js)
    assert initial['placement'] == 'above', initial
    assert initial['top'] >= 7 and initial['bottom'] <= initial['viewportHeight']-7, initial
    assert initial['bottom'] <= initial['badgeTop'] - 7, initial
    # With enough headroom, explicitly prefer above (not below) the pill.
    a.evaluate("() => {document.querySelector('[role=menu]').style.top='480px';window.dispatchEvent(new Event('resize'));}")
    a.wait_for_timeout(180)
    badge.hover()
    tooltip.wait_for(state='visible')
    above = a.evaluate(measure_js)
    assert above['placement'] == 'above', above
    assert above['bottom'] <= above['badgeTop'] - 7, above
    assert above['top'] >= 7, above
    # Returning the menu near the top must choose the safe side layout again.
    a.evaluate("() => {document.querySelector('[role=menu]').style.top='70px';window.dispatchEvent(new Event('resize'));}")
    a.wait_for_timeout(180)
    badge.hover()
    tooltip.wait_for(state='visible')
    edge = a.evaluate(measure_js)
    assert edge['placement'] == 'upper-left' and edge['top'] >= 7, edge
    assert edge['bottom'] <= edge['viewportHeight'] - 7, edge
    # Small screenshot-sized browser windows must not clip the tooltip.
    a.set_viewport_size({'width':606,'height':390})
    a.wait_for_timeout(200)
    badge.hover()
    tooltip.wait_for(state='visible')
    small = a.evaluate(measure_js)
    assert small['top'] >= 7 and small['bottom'] <= 383, small
    assert small['left'] >= 7 and small['right'] <= 599, small
    a.set_viewport_size({'width':1280,'height':900})
    a.wait_for_timeout(200)
    badge.hover()
    # Mode switch from the pill: picker only hides the floating display.
    # A body-level menu must survive the native picker unmounting after
    # pointerdown (the failure observed on the real site).
    badge.click()
    assert a.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="picker"]').is_visible()
    # If the tier changes while the picker pill options are open, suppress
    # the entire overlay instead of leaving a Pro quota menu over High.
    a.evaluate("() => document.querySelector('#selected-label').textContent = 'High'")
    a.wait_for_timeout(180)
    assert not badge.is_visible(), 'quick menu must close after moving off Pro'
    a.evaluate("() => document.querySelector('#selected-label').textContent = 'Pro'")
    badge.wait_for(state='visible')
    badge.click()
    a.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="picker"]').click()
    assert not a.locator('#chatgpt-pro-quota-ledger-host').is_visible(), 'Picker mode should hide tray'
    assert badge.is_visible(), 'Picker mode should retain inline badge'
    badge.click()
    a.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="both"]').click()
    assert a.locator('#chatgpt-pro-quota-ledger-host').is_visible()
    # From floating settings switch to floating only, and confirm the picker pill hides.
    a.locator('#chatgpt-pro-quota-ledger-host [data-action="settings"]').click()
    select=a.locator('#pql-display-choice')
    select.click()
    assert select.is_visible(), 'display dropdown destroyed by click'
    select.select_option('floating')
    assert not badge.is_visible(), 'floating mode should hide integrated pill'
    assert a.locator('#chatgpt-pro-quota-ledger-host').is_visible()
    # Restore without Tampermonkey, using keyboard escape hatch.
    a.keyboard.press('Alt+Shift+q')
    badge.wait_for(state='visible')
    # Browser-level simulated cross-tab insertion and storage notification.
    # The separate Node VM suite tests two independently executing tabs.
    a.evaluate("""() => {
      const prefix='local_chatgpt_pro_quota_ledger_v2:Default:';
      localStorage.setItem(prefix+'event:cross-tab-insertion',JSON.stringify({
        id:'cross-tab-insertion', type:'auto',at:Date.now(),tab:'other',model:'gpt-6-pro'}));
      window.dispatchEvent(new StorageEvent('storage',{key:prefix+'event:cross-tab-insertion'}));
    }""")
    a.locator('#card').get_by_text('37/50 remaining',exact=True).wait_for(timeout=5000)
    # Enable diagnostics, verify redaction and the new cross-tab checksum.
    if not a.locator('#chatgpt-pro-quota-ledger-host [data-action="diag-preview"]').is_visible():
        a.locator('#chatgpt-pro-quota-ledger-host [data-action="settings"]').click()
    a.locator('#chatgpt-pro-quota-ledger-host [data-action="diag-preview"]').click()
    raw=a.locator('#chatgpt-pro-quota-ledger-host [aria-label="Diagnostic report preview"]').inner_text()
    report=json.loads(raw)
    assert report['quota']['estimated_remaining']==37
    assert report['synchronization']['event_records']==13
    assert len(report['synchronization']['ledger_checksum'])==8
    assert report['diagnostics']==[], 'Capture is disabled by default'
    a.locator('#chatgpt-pro-quota-ledger-host [data-action="diag-capture"]').check()
    a.keyboard.press('Control+Shift+p')
    a.locator('#card').get_by_text('36/50 remaining',exact=True).wait_for()
    a.locator('#chatgpt-pro-quota-ledger-host [data-action="diag-preview"]').click()
    report=json.loads(a.locator('[aria-label="Diagnostic report preview"]').inner_text())
    assert report['diagnostics'] and report['diagnostics'][-1]['outcome']=='added'
    assert report['diagnostics'][-1]['kind']=='manual'
    # Reproduce native picker dismissal before the badge's click can fire.
    # The old quick menu was owned by the pill markup, so a focus-managed
    # ChatGPT menu could swallow the action. Pointerdown + independent portal
    # must survive removal of the native slider and keep options clickable.
    a.evaluate("""() => {
      document.addEventListener('pointerdown', e => {
        const native = document.querySelector('#picker-target [role="menu"]');
        if (native && !native.contains(e.target)) {
          document.querySelector('#picker-target').innerHTML = '';
        }
      }, true);
    }""")
    badge.wait_for(state='visible', timeout=5000)
    badge.click()
    quick=a.locator('#chatgpt-pro-quota-ledger-quick-host [aria-label="Counter display options"]')
    quick.wait_for(state='visible',timeout=5000)
    assert not a.locator('#picker-target [role="menu"]').count(), 'native menu should have been dismissed'
    assert a.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="floating"]').is_visible()
    quick_rect=quick.bounding_box()
    assert quick_rect is not None and quick_rect['x']>=0 and quick_rect['y']>=0, quick_rect
    a.locator('#chatgpt-pro-quota-ledger-quick-host [data-display-mode="floating"]').click()
    assert a.locator('#chatgpt-pro-quota-ledger-host').is_visible()
    assert a.evaluate('localStorage.getItem("local_chatgpt_pro_quota_ledger_v2:Default:display-mode")')=='floating'
    # An uncluttered hover card should contain useful values only; estimation
    # caveats now belong to the floating info screen.
    a.locator('#chatgpt-pro-quota-ledger-host [data-action="info"]').click()
    assert 'not a live balance from OpenAI' in a.locator('#pql-info-panel').inner_text()
    assert not network_attempts, 'Offline fixture attempted network access'
    print('CHROMIUM_INTEGRATION_PASS: uncluttered tooltip, picker-disappears-on-pointerdown, durable quick menu, picker/floating/both, dropdown, sync, diagnostics')
    context.close()
    browser.close()
