"""Real shared origin storage across two Chromium pages; all HTTP fulfilled locally.

The fixture loopback origin is fulfilled by Playwright without a server. It is not ChatGPT,
and no live account, cookie, browser profile or model request is used.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'chatgpt-pro-quota-ledger.user.js').read_text(encoding='utf-8')
ORIGIN = 'http://127.0.0.1:43127'
HTML = '<!doctype html><title>Synthetic shared-storage test</title><link rel="icon" href="data:,"><main>Fixture</main>'
PFX = 'local_chatgpt_pro_quota_ledger_v2:Default:'

with sync_playwright() as p:
    exe = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = p.chromium.launch(headless=True, executable_path=exe, args=['--no-sandbox'])
    context = browser.new_context()
    unexpected = []
    accepted = []
    def route_request(route):
        url = route.request.url
        if url in [ORIGIN + '/c/one', ORIGIN + '/c/two']:
            route.fulfill(status=200, content_type='text/html', body=HTML)
        elif url == ORIGIN + '/backend-api/conversation' and route.request.method == 'POST':
            accepted.append(url)
            route.fulfill(status=200, content_type='application/json', body='{}')
        else:
            unexpected.append(url)
            route.abort()
    context.route('**/*', route_request)
    context.add_init_script(script=JS)
    a, b = context.new_page(), context.new_page()
    a.goto(ORIGIN + '/c/one')
    b.goto(ORIGIN + '/c/two')
    for page in (a, b):
        page.locator('[data-action="toggle"]').click()
        page.get_by_text('50/50 remaining', exact=True).wait_for()
    send = '''async id => fetch('/backend-api/conversation', {
      method:'POST', body:JSON.stringify({model:'gpt-6-pro',conversation_mode_kind:'primary_assistant',
      conversation_id:'synthetic-conversation',messages:[{id,content:'Synthetic fixture only'}]})
    })'''
    a.evaluate(send, 'one')
    for page in (a, b):
        page.get_by_text('49/50 remaining', exact=True).wait_for()
    b.evaluate(send, 'two')
    for page in (a, b):
        page.get_by_text('48/50 remaining', exact=True).wait_for()
    a.reload()
    a.locator('[data-action="toggle"]').click()
    a.get_by_text('48/50 remaining', exact=True).wait_for()
    a.locator('[data-action="settings"]').click()
    a.locator('#pql-quota-choice').select_option('200')
    b.get_by_text('198/200 remaining', exact=True).wait_for()
    assert len(accepted) == 2, 'No requests beyond the two synthetic caller submissions'
    assert not unexpected, 'An unexpected external/extra request was attempted'
    assert a.evaluate(f"localStorage.getItem('{PFX}limit')") == '200'
    assert b.evaluate(f"localStorage.getItem('{PFX}limit')") == '200'
    print('CHROMIUM_STORAGE_PASS: actual origin-localStorage; two pages; accepted synthetic sends; cross-tab events; reload; shared override')
    context.close()
    browser.close()
