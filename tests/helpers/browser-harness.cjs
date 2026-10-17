'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

const CODE = fs.readFileSync(path.join(__dirname, '..', '..', 'chatgpt-pro-quota-ledger.user.js'), 'utf8');
const PREFIX = 'local_chatgpt_pro_quota_ledger_v2:';
const oldKey = 'local_chatgpt_pro_quota_ledger_v1';
let id = 0;

function sharedStore(initial = {}) {
  const db = new Map(Object.entries(initial));
  return { db,
    getItem(k) { return db.has(k) ? db.get(k) : null; },
    setItem(k, v) { db.set(k, String(v)); },
    removeItem(k) { db.delete(k); },
    key(n) { return [...db.keys()][n] ?? null; },
    get length() { return db.size; }
  };
}
function createTab(store = sharedStore(), opts = {}) {
  const listeners = new Map();
  const docListeners = new Map();
  const requests = [];
  const url = { pathname: opts.pathname ?? '/c/example' };
  const queued = [];
  const underlyingFetch = opts.fetch ?? (async (input) => {
    const res = queued.length ? queued.shift() : { status: 200 };
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      clone: () => ({ json: async () => res.payload || {} })
    };
  });
  const prompts = opts.prompts ? [...opts.prompts] : [];
  const rendered = { panel: null, shadow: null };
  const window = {
    location: url,
    addEventListener(name, fn) { listeners.set(name, fn); },
    fetch(input, init) { requests.push({ input, init }); return underlyingFetch(input, init); },
  };
  window.top = window;
  const document = {
    readyState: 'loading',
    body: opts.body ? {appendChild(el){rendered.panel=el;}} : null,
    addEventListener(name, fn) { docListeners.set(name, fn); },
    createElement(tag) {
      assert.equal(tag, 'div');
      const panel = { id:null,style:{},shadowRoot:null,attachShadow() {
        const surface = {html:'',writes:0,
          get innerHTML(){return this.html;},
          set innerHTML(value){this.html=value;this.writes++;}};
        const shadow = {innerHTML:'',surface,click:null,change:null,activeElement:null,
          querySelector(selector) {return selector==='#surface'?surface:null;},
          addEventListener(name, fn){if(name==='click')this.click=fn; if(name==='change')this.change=fn;}};
        this.shadowRoot = shadow;
        rendered.shadow = shadow;
        return shadow;
      }};
      return panel;
    }
  };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.ms])); }
    static now() { return clock.ms; }
  }
  const clock = { ms: opts.now || Date.parse('2026-10-12T12:00:00Z') };
  const ctx = { window, document, location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/c/example',
      get pathname() { return url.pathname; } }, localStorage: store,
    URL, Promise, JSON, Number, String, Array, Set, Map, Math, Date: FakeDate,
    crypto: { randomUUID: () => `uuid-${++id}` },
    setInterval: () => 1, setTimeout: () => 1, confirm: () => true, prompt: () => prompts.shift() ?? null,
    XMLHttpRequest: opts.XMLHttpRequest };
  vm.runInNewContext(CODE, ctx, { filename: 'chatgpt-pro-quota-ledger.user.js' });
  docListeners.get('DOMContentLoaded')();
  const key = (type, profile='Default') => `${PREFIX}${encodeURIComponent(profile)}:${type}:`;
  const events = (profile='Default') => [...store.db.entries()]
    .filter(([k]) => k.startsWith(key('event', profile)))
    .map(([, v]) => JSON.parse(v));
  const statuses = (profile='Default') => [...store.db.entries()]
    .filter(([k]) => k.startsWith(key('status', profile)))
    .map(([, v]) => JSON.parse(v));
  const request = (model='gpt-6-pro', msg='m1', extras={}) => ({
    model, conversation_mode_kind: 'primary_assistant',
    conversation_id: 'private-conversation-id', messages: [{ id: msg, content: 'TOP SECRET PROMPT' }], ...extras
  });
  const send = async (body=request(), endpoint='/backend-api/conversation') => {
    await window.fetch(`https://chatgpt.com${endpoint}`, { method: 'POST', body: JSON.stringify(body) });
    await tick();
  };
  const init = async payload => {
    queued.push({status:200,payload});
    await window.fetch('https://chatgpt.com/backend-api/conversation/init', {method:'POST'});
    await tick();
  };
  const account = async (payload, endpoint='/backend-api/accounts/check/v4-2023-04-27') => {
    queued.push({status:200,payload});
    await window.fetch(`https://chatgpt.com${endpoint}`, {method:'GET'});
    await tick();
  };
  const manual = () => listeners.get('keydown')({ repeat:false, metaKey:false, ctrlKey:true, shiftKey:true, altKey:false,
    code:'KeyP',preventDefault(){},stopImmediatePropagation(){} });
  return {store, clock, window, listeners, requests, url, queued, rendered, prompts, events, statuses, request, send, init, account, manual};
}
async function tick(){for(let i=0;i<5;i++)await Promise.resolve();}

function scopedCount(t, profile='Default', ms=t.clock.ms) {
  const status = t.statuses(profile);
  const anchors=status.map(x=>Date.parse(x.until)).filter(x=>Number.isFinite(x)&&x<=ms);
  const anchor=anchors.length?Math.max(...anchors):null;
  const elapsed=anchor===null?null:Math.floor((ms-anchor)/(7*86400e3));
  const currentCycle=elapsed===null?0:anchor+Math.max(0,elapsed)*(7*86400e3);
  const since=Math.max(ms-7*86400e3,currentCycle);
  const ev=t.events(profile).filter(e=>e.at>=since&&e.at<=ms+1000);
  const autos=ev.filter(e=>e.type==='auto');
  const linked=new Set(autos.map(e=>e.manualId).filter(Boolean));
  return autos.length+ev.filter(e=>e.type==='manual'&&!linked.has(e.id)).length;
}


function click(t, action) { t.rendered.shadow.click({target:{closest:()=>({dataset:{action}})}}); }
function report(t) {
  click(t,'toggle'); click(t,'settings'); click(t,'diag-preview');
  const html=t.rendered.shadow.surface.innerHTML;
  const found=html.match(/<pre aria-label="Diagnostic report preview">([\s\S]*?)<\/pre>/);
  if(!found) throw new Error('No diagnostic preview rendered');
  const text=found[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  return JSON.parse(text);
}
module.exports={sharedStore,createTab,tick,scopedCount,click,report,PREFIX,oldKey};
