'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createTab, sharedStore, report, tick, PREFIX} = require('./helpers/browser-harness.cjs');
const {stripDocumentation, sha256} = require('../scripts/check_repository.cjs');
const profilePrefix = `${PREFIX}Default:`;

// Characterization tests deliberately preserve known v0.3.4 limitations. They
// document current behavior, not desired behavior or server billing rules.
test('documentation-only source reconstructs the accepted predecessor exactly', () => {
  const code = fs.readFileSync(path.join(__dirname,'..','chatgpt-pro-quota-ledger.user.js'),'utf8');
  const provenance = require('../docs/provenance.json');
  assert.equal(sha256(stripDocumentation(code)), provenance.baseline.userscript_sha256);
  assert.notEqual(sha256(code), provenance.baseline.userscript_sha256, 'Comments really were added');
  assert.notEqual(sha256(stripDocumentation(code.replace('const QUOTA_DEFAULT = 50;', 'const QUOTA_DEFAULT = 51;'))),
    provenance.baseline.userscript_sha256, 'A runtime change must fail the preservation check');
});

test('fetch forwards exact original arguments and returns the original promise', async () => {
  let received;
  const response = {ok:true,status:200};
  const promise = Promise.resolve(response);
  const t = createTab(sharedStore(), {fetch: (...args) => {received=args; return promise;}});
  const input = 'https://chatgpt.com/backend-api/conversation';
  const options = {method:'POST',body:JSON.stringify(t.request()),headers:{'X-Fixture':'synthetic'}};
  const result=t.window.fetch(input,options);
  assert.strictEqual(result,promise);
  assert.strictEqual(received[0],input);
  assert.strictEqual(received[1],options);
  assert.strictEqual(await result,response);
  await tick();
  assert.equal(t.events().length,1);
});

test('fetch Request-like cloning observes metadata without changing the request', async () => {
  const t=createTab();
  let clones=0;
  const input={url:'https://chatgpt.com/backend-api/conversation',method:'POST',
    clone(){clones++;return{text:async()=>JSON.stringify(t.request('gpt-6-pro','cloned'))};}};
  await t.window.fetch(input); await tick();
  assert.equal(clones,1);
  assert.strictEqual(t.requests[0].input,input);
  assert.equal(t.events().length,1);
});

test('malformed, non-string and oversized submission bodies are not counted', async () => {
  const t=createTab();
  for(const body of ['{not-json', {model:'gpt-6-pro'},
    JSON.stringify(t.request('gpt-6-pro','large',{padding:'x'.repeat(1000001)}))]) {
    await t.window.fetch('https://chatgpt.com/backend-api/conversation',{method:'POST',body});
    await tick();
  }
  assert.equal(t.events().length,0);
  assert.equal(t.requests.length,3,'Only caller-generated requests were forwarded');
});

test('cross-origin and GET requests do not become Pro counts', async () => {
  const t=createTab();
  const body=JSON.stringify(t.request());
  await t.window.fetch('https://example.invalid/backend-api/conversation',{method:'POST',body});
  await t.window.fetch('https://chatgpt.com/backend-api/conversation',{method:'GET',body});
  await tick();
  assert.equal(t.events().length,0);
});

function xhrClass() {
  // A new class per test avoids carrying patched prototypes between fixtures.
  return class FakeXHR {
    constructor(){this.listeners=[];this.status=0;this.responseType='';this.responseText='';}
    open(...args){this.openArgs=args;return 'open-result';}
    send(...args){this.sendArgs=args;return 'send-result';}
    addEventListener(name,fn){if(name==='loadend')this.listeners.push(fn);}
    finish(status,body=''){this.status=status;this.responseText=body;for(const fn of this.listeners.splice(0))fn();}
  };
}
test('XHR counts only at successful loadend and preserves original arguments', () => {
  const XHR=xhrClass();
  const t=createTab(sharedStore(),{XMLHttpRequest:XHR});
  const x=new XHR();
  const body=JSON.stringify(t.request());
  assert.equal(x.open('POST','/backend-api/conversation',true),'open-result');
  assert.equal(x.send(body),'send-result');
  assert.deepEqual(x.openArgs,['POST','/backend-api/conversation',true]);
  assert.deepEqual(x.sendArgs,[body]);
  assert.equal(t.events().length,0,'Not counted merely by invoking send');
  x.finish(200);
  assert.equal(t.events().length,1);
  const fail=new XHR();fail.open('POST','/backend-api/conversation');fail.send(body);fail.finish(429);
  assert.equal(t.events().length,1);
});
test('XHR init response supplies a block without an autonomous request', () => {
  const XHR=xhrClass();
  const t=createTab(sharedStore(),{XMLHttpRequest:XHR});
  const x=new XHR();x.open('POST','/backend-api/conversation/init');x.send('{}');
  x.finish(200,JSON.stringify({model_limits:[{model_slug:'gpt-6-pro',resets_after:'2026-10-13T12:00:00Z'}]}));
  assert.equal(t.statuses().at(-1).kind,'blocked');
  assert.equal(t.requests.length,0);
});

test('characterization: system-hint-only research is not an exhaustive scope exclusion', async () => {
  const t=createTab();
  await t.send(t.request('gpt-6-pro','research',{system_hints:['connector:connector_openai_deep_research']}));
  assert.equal(t.events().length,1,'Current classifier checks explicit mode/path, not system hints');
});
test('characterization: http_status is stored but omitted after export sanitization', async () => {
  const t=createTab(sharedStore({[profilePrefix+'diagnostics-enabled']:'1'}),{body:true});
  t.queued.push({status:429});
  await t.send();
  const stored=[...t.store.db.entries()].filter(([key])=>key.includes(':diagnostic:')).map(([,v])=>JSON.parse(v));
  assert.equal(stored[0].http_status,429);
  const snapshot=report(t);
  assert.equal(snapshot.diagnostics[0].outcome,'rejected');
  assert.ok(!('http_status' in snapshot.diagnostics[0]),'Known camelCase/snake_case round-trip omission');
});
test('characterization: equal key checksum does not imply equal record values or counts', () => {
  const now=Date.parse('2026-10-12T12:00:00Z');
  const key=profilePrefix+'event:one';
  const make=at=>sharedStore({[key]:JSON.stringify({id:'one',type:'auto',at,model:'gpt-6-pro'})});
  const a=createTab(make(now-1000),{body:true,now});
  const b=createTab(make(now-8*86400e3),{body:true,now});
  const ar=report(a),br=report(b);
  assert.equal(ar.synchronization.ledger_checksum,br.synchronization.ledger_checksum);
  assert.equal(ar.quota.locally_observed,1);
  assert.equal(br.quota.locally_observed,0);
});
test('characterization: old retained event can suppress a current local rollover date', async () => {
  const now=Date.parse('2026-10-12T12:00:00Z');
  const store=sharedStore({[profilePrefix+'event:old']:JSON.stringify({id:'old',type:'auto',at:now-8*86400e3})});
  const t=createTab(store,{body:true,now});
  await t.send(t.request('gpt-6-pro','newer'));
  const snapshot=report(t);
  assert.equal(snapshot.quota.locally_observed,1);
  assert.equal(snapshot.quota.next_reset,null,'The oldest retained event is outside the current window');
});
test('characterization: setItem-only failure is not a complete in-memory fallback', async () => {
  const store=sharedStore();
  store.setItem=()=>{throw new Error('Synthetic quota-exceeded write failure');};
  const t=createTab(store,{body:true});
  await t.send();
  const snapshot=report(t);
  assert.equal(snapshot.synchronization.local_storage_accessible,false);
  assert.equal(snapshot.quota.locally_observed,0,'Fallback write is missed by successful store enumeration');
});
test('characterization: an unmatched manual mark persists beyond its four-minute pairing window', () => {
  const t=createTab(sharedStore(),{body:true});t.manual();t.clock.ms+=5*60000;
  const snapshot=report(t);
  assert.equal(snapshot.quota.manual_only,1);
});
test('characterization: one matched model restriction drives the aggregate blocked display', async () => {
  const t=createTab(sharedStore(),{body:true});
  await t.init({model_limits:[{model_slug:'gpt-5-6-pro',resets_after:'2026-10-13T12:00:00Z'}]});
  const snapshot=report(t);
  assert.equal(snapshot.quota.currently_blocked,true);
  assert.equal(snapshot.quota.estimated_remaining,0);
});
