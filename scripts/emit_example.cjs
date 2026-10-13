'use strict';
/** Emit synthetic schema-v1 JSON from the real userscript, never real account data. */
const {createTab,sharedStore,report,tick,PREFIX}=require('../tests/helpers/browser-harness.cjs');
(async()=>{
  const p=`${PREFIX}Default:`;
  const store=sharedStore({[p+'diagnostics-enabled']:'1'});
  const t=createTab(store,{body:true,now:Date.parse('2026-10-12T12:00:00Z')});
  await t.account({accounts:{default:{account:{plan_type:'prolite'}}}});
  await t.send(t.request('gpt-6-pro','synthetic-first'));
  t.manual();
  await t.send(t.request('gpt-6-pro','synthetic-second'));
  await tick();
  process.stdout.write(JSON.stringify(report(t),null,2)+'\n');
})().catch(error=>{console.error(error.message);process.exit(1);});
