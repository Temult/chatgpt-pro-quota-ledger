'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sharedStore,createTab,tick,scopedCount,PREFIX,oldKey}=require('./helpers/browser-harness.cjs');

test('automatic counting, non-Pro rejection and no extra network requests', async () => {
  const t=createTab();
  await t.send(t.request('gpt-6-pro','one'));
  await t.send(t.request('gpt-5-6-pro','two'));
  await t.send(t.request('gpt-6-thinking','three'));
  await t.send(t.request('gpt-6-pro','four',{conversation_mode_kind:'agent'}));
  assert.equal(scopedCount(t),2);
  assert.equal(t.requests.length,4);
  assert.equal(t.events().length,2);
  assert.equal(JSON.stringify([...t.store.db.values()]).includes('TOP SECRET PROMPT'),false);
  assert.equal(JSON.stringify([...t.store.db.values()]).includes('private-conversation-id'),false);
});

test('manual keypress merges with accepted Pro send and avoids duplicates', async () => {
  const t=createTab();
  t.manual();
  assert.equal(scopedCount(t),1);
  await t.send(t.request('gpt-6-pro','one'));
  assert.equal(scopedCount(t),1);
  assert.equal(t.events().length,2); // One manual marker + one auto, linked
  assert.equal(t.events().find(e=>e.type==='auto').manualId,t.events().find(e=>e.type==='manual').id);
  await t.send(t.request('gpt-6-pro','one'));
  assert.equal(scopedCount(t),1,'immediate retry must not count twice');
  t.manual(); // Manual fallback always adds a mark until it is paired.
  assert.equal(scopedCount(t),2);
  t.clock.ms += 21_000;
  t.manual();
  assert.equal(scopedCount(t),3);
});

test('HTTP failure, unknown route and off-chat scope do not count', async () => {
  const t=createTab();
  t.queued.push({status:429});
  await t.send(t.request());
  assert.equal(scopedCount(t),0);
  await t.send(t.request('gpt-6-pro','m2'), '/backend-api/other');
  assert.equal(scopedCount(t),0);
  t.url.pathname='/work/dashboard';
  await t.send(t.request('gpt-6-pro','m3'));
  assert.equal(scopedCount(t),0);
  t.url.pathname='/c/example';
  await t.send(t.request('gpt-6-pro','m4'), '/backend-api/f/conversation');
  assert.equal(scopedCount(t),1);
});

test('independent keys prevent multi-tab lost updates', async () => {
  const storage=sharedStore();
  const one=createTab(storage); const two=createTab(storage);
  await Promise.all([
    one.send(one.request('gpt-6-pro','tab-one')),
    two.send(two.request('gpt-6-pro','tab-two')),
  ]);
  assert.equal(one.events().length,2);
  assert.equal(scopedCount(one),2);
  assert.equal(scopedCount(two),2);
});

test('local account profiles separate usage', async () => {
  const t=createTab();
  await t.send(t.request('gpt-6-pro','default'));
  t.store.setItem(`${PREFIX}active-profile`,'Alternate');
  await t.send(t.request('gpt-6-pro','alternate'));
  assert.equal(scopedCount(t,'Default'),1);
  assert.equal(scopedCount(t,'Alternate'),1);
});

test('v0.1 migration is lossless, idempotent and retains server reset', async () => {
  const time=Date.parse('2026-10-12T12:00:00Z');
  const legacy={v:1,cycleStart:'2026-10-10T15:30:42.248749+00:00',cycleCertified:true,
    events:Array.from({length:12},(_,i)=>({id:`legacy-${i}`,at:time-10000+i,tab:'old',
    source:'auto',model:'gpt-6-pro',key:`my-conv-${i}`}))};
  const storage=sharedStore({[oldKey]:JSON.stringify(legacy)});
  const a=createTab(storage); const b=createTab(storage);
  assert.equal(scopedCount(a),12);
  assert.equal(scopedCount(b),12);
  assert.equal(a.statuses().filter(s=>s.kind==='reset').length,1);
  assert.equal(storage.getItem(oldKey),JSON.stringify(legacy),'v0.1 is never modified');
});

test('server-confirmed future block, expiration and new cycle anchor',async()=>{
  const t=createTab();
  const reset='2026-10-12T13:00:00Z';
  await t.send(t.request());
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:reset}],
    blocked_features:[{name:'reason',limit:50,resets_after:reset}]});
  assert.equal(t.statuses().filter(s=>s.kind==='blocked').length,1);
  assert.equal(t.statuses().find(s=>s.kind==='blocked').until,reset);
  t.clock.ms=Date.parse('2026-10-12T13:00:02Z');
  assert.equal(scopedCount(t),0,'pre-reset events excluded after backend reset');
  await t.init({model_limits:[]});
  assert.ok(t.statuses().some(s=>s.kind==='unblocked'));
  await t.send(t.request('gpt-6-pro','after-reset'));
  assert.equal(scopedCount(t),1);
});

test('outgoing request attributes usage to profile at send time',async()=>{
  let resolveResponse;
  const storage=sharedStore();
  const t=createTab(storage,{ fetch: () => new Promise(resolve=>{resolveResponse=resolve;}) });
  const sending=t.window.fetch('https://chatgpt.com/backend-api/conversation',
    {method:'POST',body:JSON.stringify(t.request('gpt-6-pro','inflight'))});
  storage.setItem(`${PREFIX}active-profile`,'Other');
  resolveResponse({ok:true,clone:()=>({json:async()=>({})})});
  await sending; await tick();
  assert.equal(scopedCount(t,'Default'),1);
  assert.equal(scopedCount(t,'Other'),0);
});

test('migrated manual+auto is exactly one mark',()=>{
  const legacy={v:1,events:[{id:'legacy-one',at:Date.parse('2026-10-12T11:00:00Z'),source:'manual+auto',tab:'old',model:'gpt-6-pro'}]};
  const t=createTab(sharedStore({[oldKey]:JSON.stringify(legacy)}));
  assert.equal(scopedCount(t),1);
});

test('manual account history is not erased by another tab writing',async()=>{
  const storage=sharedStore();
  const one=createTab(storage); const two=createTab(storage);
  one.manual(); two.manual();
  assert.equal(scopedCount(one),2);
  await one.send(one.request('gpt-6-pro','merge-one'));
  assert.equal(scopedCount(two),2);
  await two.send(two.request('gpt-6-pro','merge-two'));
  assert.equal(scopedCount(one),2);
});


test('real UI path mounts, expands and renders escaped local profile label', async () => {
  const t=createTab(sharedStore(),{body:true});
  assert.ok(t.rendered.shadow.surface.innerHTML.includes('Pro: 0 observed'));
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  assert.ok(t.rendered.shadow.surface.innerHTML.includes('ChatGPT Pro ledger'));
  t.store.setItem(`${PREFIX}active-profile`, '<Test&Profile>');
  await t.send(t.request('gpt-6-pro','ui-test'));
  assert.ok(t.rendered.shadow.surface.innerHTML.includes('&lt;Test&amp;Profile&gt;'));
  assert.equal(t.rendered.shadow.surface.innerHTML.includes('<Test&Profile>'),false);
});

test('UI controls switch profiles, set limits and undo only manual marks', async()=>{
  const t=createTab(sharedStore(),{body:true,prompts:['Other account','75']});
  const click = action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');click('profile');
  assert.equal(t.store.getItem(`${PREFIX}active-profile`),'Other account');
  click('limit');
  assert.equal(t.store.getItem(`${PREFIX}Other%20account:limit`),'75');
  click('manual');
  assert.equal(scopedCount(t,'Other account'),1);
  click('undo');
  assert.equal(scopedCount(t,'Other account'),0);
});

test('expanded counter shows remaining of weekly allowance rather than used', async () => {
  const t=createTab(sharedStore(), {body:true});
  for(let n=0;n<12;n++) await t.send(t.request('gpt-6-pro',`m-${n}`));
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  const ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui,/38\/50 remaining/);
  assert.ok(!ui.includes('12 / 50 estimated'));
  assert.match(ui,/Estimate from partial local history/);
  assert.equal(scopedCount(t),12);
});

test('passively detect Pro $100 subscription from accounts/check, without credential access', async () => {
  const t=createTab(sharedStore(), {body:true});
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  await t.account({accounts:{default:{account:{plan_type:'prolite',account_id:'SECRET-ACCOUNT'},entitlement:{subscription_plan:'Pro 100'}}}});
  const detected=JSON.parse(t.store.getItem(`${PREFIX}Default:detected-plan`));
  assert.equal(detected.slug,'prolite');
  assert.equal(t.store.db.size>0,true);
  assert.match(t.rendered.shadow.surface.innerHTML,/Detected: Pro \$100/);
  assert.match(t.rendered.shadow.surface.innerHTML,/50\/50 remaining/);
  assert.equal(JSON.stringify([...t.store.db.values()]).includes('SECRET-ACCOUNT'),false);
  assert.equal(t.requests.length,1,'observer must not issue extra requests');
});

test('Pro $200 detected, but unknown modern allowance requires manual override', async () => {
  const t=createTab(sharedStore(), {body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');
  await t.account({accounts:{default:{account:{plan_type:'pro'}}}});
  click('settings');
  assert.match(t.rendered.shadow.surface.innerHTML,/Plan: Pro \$200/);
  assert.match(t.rendered.shadow.surface.innerHTML,/50-message fallback/);
  t.rendered.shadow.change({target:{dataset:{action:'quota-select'},value:'200'}});
  assert.equal(t.store.getItem(`${PREFIX}Default:limit`),'200');
  assert.match(t.rendered.shadow.surface.innerHTML,/200\/200 remaining/);
  t.rendered.shadow.change({target:{dataset:{action:'quota-select'},value:'auto'}});
  assert.equal(t.store.getItem(`${PREFIX}Default:limit`),null);
  assert.match(t.rendered.shadow.surface.innerHTML,/50\/50 remaining/);
});

test('settings permit custom limit; existing v0.2 manual override persists', async () => {
  const base=sharedStore({[`${PREFIX}Default:limit`]:'77'});
  const t=createTab(base, {body:true,prompts:['125']});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');
  assert.match(t.rendered.shadow.surface.innerHTML,/77\/77 remaining/);
  click('settings');
  assert.match(t.rendered.shadow.surface.innerHTML,/Custom \(77\)/);
  t.rendered.shadow.change({target:{dataset:{action:'quota-select'},value:'custom'}});
  assert.equal(t.store.getItem(`${PREFIX}Default:limit`),'125');
  assert.match(t.rendered.shadow.surface.innerHTML,/125\/125 remaining/);
});

test('server-reported restricted-Pro cap takes precedence unless user overrides', async () => {
  const t=createTab(sharedStore(), {body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');click('settings');
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-12T18:00:00Z'}],
    blocked_features:[{name:'reason',limit:70,resets_after:'2026-10-12T18:00:00Z'}]});
  assert.match(t.rendered.shadow.surface.innerHTML,/0\/70 remaining/);
  assert.match(t.rendered.shadow.surface.innerHTML,/server-observed limit/);
  t.rendered.shadow.change({target:{dataset:{action:'quota-select'},value:'50'}});
  assert.match(t.rendered.shadow.surface.innerHTML,/0\/50 remaining/);
});

test('next date is future server deadline, not previous reset',async()=>{
  const t=createTab(sharedStore(), {body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');
  const now=t.clock.ms;
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-12T20:00:00Z'}],
    blocked_features:[{name:'reason',limit:50,resets_after:'2026-10-12T20:00:00Z'}]});
  assert.match(t.rendered.shadow.surface.innerHTML,/Next reset \(server-confirmed\)/);
  assert.match(t.rendered.shadow.surface.innerHTML,/Oct 12/);
  assert.ok(!t.rendered.shadow.surface.innerHTML.includes('Most recent server reset'));
  t.clock.ms=Date.parse('2026-10-12T20:00:02Z');
  await t.init({model_limits:[]});
  const projected=t.rendered.shadow.surface.innerHTML;
  assert.match(projected,/Next reset \(7-day projection\)/);
  assert.match(projected,/Oct 19/);
  assert.ok(!projected.includes('Most recent server reset'));
  t.clock.ms=now;
});

test('v0.1 reset timestamp projects forward by seven days rather than displaying old date',async()=>{
  const legacy={v:1,cycleStart:'2026-10-10T15:30:42.248749+00:00',cycleCertified:true,
    events:Array.from({length:12},(_,i)=>({id:`pre-${i}`,at:Date.parse('2026-10-12T11:00:00Z')+i,source:'auto',model:'gpt-6-pro'}))};
  const t=createTab(sharedStore({[oldKey]:JSON.stringify(legacy)}), {body:true});
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  const ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui,/38\/50 remaining/);
  assert.match(ui,/Next reset \(7-day projection\)/);
  assert.match(ui,/Oct 17/);
  assert.ok(!ui.includes('Most recent server reset'));
});

test('plan change invalidates stale server-observed cap without deleting events',async()=>{
  const t=createTab(sharedStore(), {body:true});
  await t.send(t.request('gpt-6-pro','keep-this'));
  await t.account({accounts:{default:{account:{plan_type:'prolite'}}}});
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-12T20:00:00Z'}],
    blocked_features:[{name:'reason',limit:80,resets_after:'2026-10-12T20:00:00Z'}]});
  assert.equal(JSON.parse(t.store.getItem(`${PREFIX}Default:server-limit`)).max,80);
  await t.account({accounts:{default:{account:{plan_type:'pro'}}}});
  assert.equal(t.store.getItem(`${PREFIX}Default:server-limit`),null);
  assert.equal(t.events().length,1);
});


function withProjectedCycle(hoursUntilReset, used = 38) {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const anchor = now + hoursUntilReset * 3600000 - 7 * 86400e3;
  const seed = {
    [`${PREFIX}Default:status:verified`]: JSON.stringify({
      kind: 'reset', at: anchor, until: new Date(anchor).toISOString()
    })
  };
  for (let i = 0; i < used; i++) {
    seed[`${PREFIX}Default:event:existing-${i}`] = JSON.stringify({
      id: `existing-${i}`, type: 'auto', at: now - 5000 + i, model: 'gpt-6-pro', tab: 'other-tab'
    });
  }
  const t = createTab(sharedStore(seed), { body: true, now });
  const click = action => t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');
  return {t, click, now};
}

test('daily pace uses exact elapsed days: 12 messages with 24h = 12/day', () => {
  const {t} = withProjectedCycle(24);
  const ui = t.rendered.shadow.surface.innerHTML;
  assert.match(ui, /12\/50 remaining/);
  assert.match(ui, /≈12 uses\/day/);
  assert.match(ui, /1 day left · projected deadline/);
  assert.match(ui, /Next reset \(7-day projection\)/);
});

test('daily pace scales with time: 12 remaining over 48h = 6/day', () => {
  const {t} = withProjectedCycle(48);
  const ui = t.rendered.shadow.surface.innerHTML;
  assert.match(ui, /≈6 uses\/day/);
  assert.match(ui, /2 days left · projected deadline/);
});

test('daily pace supports fractional days without rounding them up', () => {
  const {t} = withProjectedCycle(36);
  const ui = t.rendered.shadow.surface.innerHTML;
  assert.match(ui, /≈8 uses\/day/);
  assert.match(ui, /1\.5 days left/);
});

test('daily budget updates as additional Pro requests are counted', async () => {
  const {t} = withProjectedCycle(48);
  await t.send(t.request('gpt-6-pro','new-one'));
  assert.match(t.rendered.shadow.surface.innerHTML, /11\/50 remaining/);
  assert.match(t.rendered.shadow.surface.innerHTML, /≈5\.5 uses\/day/);
});

test('info section toggles independently of settings and holds all explanations', () => {
  const {t,click} = withProjectedCycle(48);
  let ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui, /data-action="settings"/);
  assert.match(ui, /data-action="info"/);
  assert.doesNotMatch(ui, /How these numbers work/);
  assert.doesNotMatch(ui, /Other devices, failed generations/);
  click('settings'); click('info');
  ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui, /aria-expanded="true" title="Explanations"/);
  assert.match(ui, /pql-settings-panel/);
  assert.match(ui, /pql-info-panel/);
  assert.match(ui, /12 with 24 hours left is 12\/day/);
  assert.match(ui, /Server-confirmed Pro restriction|server-confirmed applies/);
  click('info');
  assert.doesNotMatch(t.rendered.shadow.surface.innerHTML, /How these numbers work/);
  assert.match(t.rendered.shadow.surface.innerHTML, /Weekly message allowance/);
});

test('no known reset does not fabricate a daily budget', () => {
  const t=createTab(sharedStore(), {body:true});
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  const ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui, /Awaiting a future reset date to calculate a daily pace/);
  assert.doesNotMatch(ui, /≈[0-9.]+ uses\/day/);
});

test('blocked server state has zero budget with a confirmed deadline', async () => {
  const t=createTab(sharedStore(), {body:true});
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-14T12:00:00Z'}],
    blocked_features:[{name:'reason',limit:50,resets_after:'2026-10-14T12:00:00Z'}]});
  const ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui,/0\/50 remaining/);
  assert.match(ui,/≈0 uses\/day/);
  assert.match(ui,/2 days left · confirmed deadline/);
});

test('v0.2.1 event and limit keys remain readable and unchanged', () => {
  const {t} = withProjectedCycle(24);
  assert.equal(t.events().length,38);
  assert.equal(t.store.getItem(`${PREFIX}Default:event:existing-0`) !== null,true);
  assert.equal(t.store.getItem(`${PREFIX}Default:status:verified`) !== null,true);
  assert.equal(t.requests.length,0);
});


test('clicking a quota dropdown does not replace the live select (regression)', () => {
  const t=createTab(sharedStore(), {body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle'); click('settings');
  assert.match(t.rendered.shadow.surface.innerHTML, /data-action="quota-select"/);
  const before=t.rendered.shadow.surface.writes;
  click('quota-select'); // This used to trigger draw(), immediately closing the popup.
  assert.equal(t.rendered.shadow.surface.writes,before,'native select must remain mounted');
  t.rendered.shadow.change({target:{dataset:{action:'quota-select'},value:'200'}});
  assert.equal(t.store.getItem(`${PREFIX}Default:limit`),'200');
  assert.equal(t.rendered.shadow.surface.writes,before+1,'redraw once after the value commits');
  assert.match(t.rendered.shadow.surface.innerHTML,/200\/200 remaining/);
});

test('background refresh never destroys a focused dropdown; committed choice redraws', async () => {
  const t=createTab(sharedStore(), {body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle'); click('settings');
  const before=t.rendered.shadow.surface.writes;
  t.rendered.shadow.activeElement={dataset:{action:'quota-select'}};
  await t.send(t.request('gpt-6-pro','while-menu-open'));
  assert.equal(scopedCount(t),1,'accepted Pro request must still be counted');
  assert.equal(t.rendered.shadow.surface.writes,before,'async update must preserve focused native dropdown');
  t.listeners.get('storage')({key:`${PREFIX}Default:limit`});
  assert.equal(t.rendered.shadow.surface.writes,before,'cross-tab update must also preserve focused dropdown');
  t.rendered.shadow.change({target:{dataset:{action:'quota-select'},value:'50'}});
  assert.equal(t.rendered.shadow.surface.writes,before+1,'change forces update even if focus stays on select');
  assert.match(t.rendered.shadow.surface.innerHTML,/49\/50 remaining/);
});

test('unrecognized nested action does not redraw settings panel', () => {
  const t=createTab(sharedStore(), {body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle'); click('settings');
  const count=t.rendered.shadow.surface.writes;
  click('future-control');
  assert.equal(t.rendered.shadow.surface.writes,count);
});

test('diagnostics default off, opt-in captures only allowlisted metadata', async () => {
  const t=createTab(sharedStore(),{body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle'); click('settings');
  await t.send(t.request('gpt-6-pro','secret-msg'));
  assert.equal([...t.store.db.keys()].filter(k=>k.includes(':diagnostic:')).length,0);
  t.rendered.shadow.change({target:{dataset:{action:'diag-capture'},checked:true}});
  await t.send(t.request('gpt-6-pro','diagnosed-msg'));
  await t.send(t.request('gpt-6-thinking','non-pro-msg'));
  t.queued.push({status:429});
  await t.send(t.request('gpt-6-pro','rate-limited-msg'));
  t.manual();
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-12T20:00:00Z'}],
    blocked_features:[{name:'reason',limit:50,resets_after:'2026-10-12T20:00:00Z'}]});
  click('diag-preview');
  const panel=t.rendered.shadow.surface.innerHTML;
  assert.match(panel,/Diagnostic report preview/);
  assert.match(panel,/redacted JSON report|Copy and download use these exact/);
  const diagnostics=[...t.store.db.entries()].filter(([key])=>key.includes(':diagnostic:')).map(([,value])=>JSON.parse(value));
  assert.ok(diagnostics.length>=4);
  assert.ok(diagnostics.some(x=>x.outcome==='counted'));
  assert.ok(diagnostics.some(x=>x.outcome==='not-pro'));
  assert.ok(diagnostics.some(x=>x.outcome==='rejected'));
  assert.ok(diagnostics.some(x=>x.kind==='manual'));
  assert.ok(diagnostics.every(x=>Object.keys(x).every(k=>
    ['at','kind','outcome','source','endpoint','model','plan','http_status','limit'].includes(k))));
  const all=JSON.stringify([...t.store.db.entries()]);
  assert.doesNotMatch(all,/TOP SECRET PROMPT|private-conversation-id|secret-msg|diagnosed-msg/);
  assert.match(panel,/ledger_checksum/);
  assert.match(panel,/event_records/);
});

test('diagnostic preview strips unrecognized fields from contaminated local record and preserves quota',async()=>{
  const t=createTab(sharedStore(),{body:true});
  await t.send(t.request('gpt-6-pro','one'));
  const now=t.clock.ms;
  t.store.setItem(`${PREFIX}Default:diagnostic:evil`,JSON.stringify({kind:'submission',at:now,outcome:'counted',
    model:'secret-model-PROMPT', source:'evil',endpoint:'leak.example',prompt:'VERY PRIVATE PROMPT',
    access_token:'HIGHLY_PRIVATE_TOKEN',nested:{secret:'DO NOT EXPORT'}}));
  t.store.setItem(`${PREFIX}Default:diagnostic:old`,JSON.stringify({kind:'manual',at:now-10*864e5,outcome:'added'}));
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');click('settings');click('diag-preview');
  const html=t.rendered.shadow.surface.innerHTML;
  assert.doesNotMatch(html,/VERY PRIVATE PROMPT|HIGHLY_PRIVATE_TOKEN|DO NOT EXPORT|secret-model-PROMPT/);
  assert.match(html,/ledger_checksum/);
  assert.equal(t.store.getItem(`${PREFIX}Default:diagnostic:old`),null,'old diagnostics are trimmed');
  assert.equal(scopedCount(t),1,'diagnostic hygiene must not change message count');
  click('diag-clear');
  assert.equal(t.store.getItem(`${PREFIX}Default:diagnostic:evil`),null);
  assert.equal(scopedCount(t),1,'clear log does not clear ledger events');
});

test('floating display mode is synced by shared storage, and focus refresh resolves stale view',async()=>{
  const store=sharedStore();
  const a=createTab(store,{body:true});
  const b=createTab(store,{body:true});
  const click=(t,action)=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click(a,'toggle');click(a,'settings');click(b,'toggle');
  a.rendered.shadow.change({target:{dataset:{action:'display-select'},value:'picker'}});
  assert.equal(store.getItem(`${PREFIX}Default:display-mode`),'picker');
  b.listeners.get('storage')({key:`${PREFIX}Default:display-mode`});
  assert.equal(b.rendered.panel.style.display,'none');
  // Even though the current test has no simulated native picker, the user can
  // recover the floating mode without visiting Tampermonkey.
  const escape={altKey:true,shiftKey:true,ctrlKey:false,metaKey:false,repeat:false,code:'KeyQ',
    preventDefault(){},stopImmediatePropagation(){}};
  b.listeners.get('keydown')(escape);
  assert.equal(store.getItem(`${PREFIX}Default:display-mode`),'both');
  a.listeners.get('focus')();
  assert.equal(a.rendered.panel.style.display,'block');
  await b.send(b.request('gpt-6-pro','cross-tab-send'));
  a.listeners.get('focus')();
  assert.equal(scopedCount(a),1);
  assert.equal(scopedCount(b),1);
  assert.match(a.rendered.shadow.surface.innerHTML,/49\/50 remaining/);
});

test('display selector click does not destroy focused dropdown before change',()=>{
  const t=createTab(sharedStore(),{body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  click('toggle');click('settings');
  const before=t.rendered.shadow.surface.writes;
  click('display-select');
  assert.equal(t.rendered.shadow.surface.writes,before);
  t.rendered.shadow.activeElement={dataset:{action:'display-select'}};
  t.listeners.get('storage')({key:`${PREFIX}Default:event:other-tab`});
  assert.equal(t.rendered.shadow.surface.writes,before);
  t.rendered.shadow.change({target:{dataset:{action:'display-select'},value:'floating'}});
  assert.equal(t.store.getItem(`${PREFIX}Default:display-mode`),'floating');
  assert.equal(t.rendered.shadow.surface.writes,before+1);
});

test('diagnostics retain full quota evidence despite capture being disabled',async()=>{
  const t=createTab(sharedStore(),{body:true});
  const click=action=>t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}});
  await t.init({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-13T17:00:00Z'}],
    blocked_features:[{name:'reason',limit:50,resets_after:'2026-10-13T17:00:00Z'}]});
  assert.equal(t.statuses().filter(e=>e.kind==='blocked').length,1);
  assert.equal([...t.store.db.keys()].filter(k=>k.includes(':diagnostic:')).length,0);
  click('toggle');click('settings');click('diag-preview');
  const html=t.rendered.shadow.surface.innerHTML;
  assert.match(html,/server-confirmed/);
  assert.match(html,/configured_limit/);
  assert.match(html,/estimated_remaining/);
});


test('Oct 17 turnover resets remaining counter at the same projected boundary as Oct 24 date',async()=>{
  const base=Date.parse('2026-10-10T15:30:42.248749Z');
  const after=base+7*86400e3+70*60000;
  const previous=base+4*86400e3;
  const initial={
    [`${PREFIX}Default:status:last-confirmed`]:JSON.stringify({kind:'reset',at:base,until:new Date(base).toISOString()}),
    [`${PREFIX}Default:detected-plan`]:JSON.stringify({slug:'prolite',source:'accounts',at:previous})
  };
  for(let i=0;i<48;i++)initial[`${PREFIX}Default:event:auto-${i}`]=JSON.stringify({
    id:`auto-${i}`,type:'auto',at:previous+i,model:'gpt-6-pro',tab:'other'
  });
  initial[`${PREFIX}Default:event:manual`]=JSON.stringify({
    id:'manual',type:'manual',at:previous+60,tab:'other'
  });
  const store=sharedStore(initial);const t=createTab(store,{body:true,now:after});
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  const ui=t.rendered.shadow.surface.innerHTML;
  assert.match(ui,/50\/50 remaining/,'49 events from previous cycle must not reduce new balance');
  assert.match(ui,/Oct 24/);
  assert.match(ui,/since projected reset/,'do not label projected cycle as confirmed');
  assert.equal(t.events().length,49,'retained events must not be erased');
  await t.send(t.request('gpt-6-pro','new-cycle'));
  assert.match(t.rendered.shadow.surface.innerHTML,/49\/50 remaining/);
  assert.equal(t.events().length,50);
});

test('exact projected reset boundary and later cycles exclude events without deleting them',async()=>{
  const anchor=Date.parse('2026-10-10T15:30:42.248Z');
  const initial={
    [`${PREFIX}Default:status:reset`]:JSON.stringify({kind:'reset',at:anchor,until:new Date(anchor).toISOString()}),
    [`${PREFIX}Default:event:old`]:JSON.stringify({type:'auto',id:'old',at:anchor+86400000})
  };
  const store=sharedStore(initial);
  const t=createTab(store,{body:true,now:anchor+7*86400e3-1});
  assert.equal(scopedCount(t),1);
  t.clock.ms=anchor+7*86400e3;
  t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
  assert.equal(scopedCount(t),0);
  assert.match(t.rendered.shadow.surface.innerHTML,/50\/50 remaining/);
  t.clock.ms=anchor+21*86400e3+1;
  assert.equal(scopedCount(t),0);
  assert.equal(t.events().length,1);
  assert.match(t.rendered.shadow.surface.innerHTML,/50\/50 remaining/);
});

test('without a known server reset, counting stays a rolling estimate',async()=>{
 const now=Date.parse('2026-10-17T16:40:00Z');
 const t=createTab(sharedStore({
   [`${PREFIX}Default:event:old`]:JSON.stringify({id:'old',type:'auto',at:now-6*86400e3})
 }),{body:true,now});
 assert.equal(scopedCount(t),1);
 t.rendered.shadow.click({target:{closest:()=>({dataset:{action:'toggle'}})}});
 assert.match(t.rendered.shadow.surface.innerHTML,/49\/50 remaining/);
 assert.match(t.rendered.shadow.surface.innerHTML,/partial local history/);
});
