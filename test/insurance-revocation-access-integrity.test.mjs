import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sites/ekodi-insurance/public/server-bridge.js', import.meta.url), 'utf8');
const extract = (startLabel,endLabel) => {
  const from=source.indexOf(startLabel),to=source.indexOf(endLabel,from);
  assert.ok(from>=0 && to>from,'actual bridge function boundary must exist');
  return source.slice(from,to);
};
const accessFunctions = extract('  function loadAccess() {', '  function handoffForm(');
const writeFunctions = extract('  function saveAccess(', '  async function revokeConsultation(');
const ACCESS_KEY='ekodi-insurance-consultation-access-v1';
const largeEntries=Array.from({length:21},(_,i)=>({
  id:'con_test-'+i, accessToken:'ic_synthetic_'+i, status:'new'
}));

function createHarness({ initial = {}, blocked = false, failAccessWrite = false,
  reply = { consultation: { id:'con_new', status:'new', createdAt:'2026-10-30' }, accessToken:'ic_synthetic_new' }
} = {}) {
  const data=new Map(Object.entries(initial));
  const calls={ fetch:0, renders:0, notifications:[], errors:[], set:[], remove:[] };
  const button={ disabled:false };
  const warnings=[];
  const form={
    resetCount:0,
    classList:{add() {}},
    querySelector(selector){
      if(selector==='button[type="submit"]')return button;
      if(selector==='#insuranceRevokeSaveFailure')return warnings[0]||null;
      return null;
    },
    append(node){ warnings.push(node); },
    reset(){ this.resetCount++; }
  };
  const ctx=vm.createContext({
    JSON, Object, Array, Math, Response, Request,
    localStorage:{
      getItem(k){return data.has(k)?data.get(k):null},
      setItem(k,value){
        calls.set.push(k);
        if(blocked || (failAccessWrite && k===ACCESS_KEY))throw new Error('QuotaExceededError');
        data.set(k,String(value));
      },
      removeItem(k){calls.remove.push(k);data.delete(k)}
    },
    document:{createElement(tag){
      assert.equal(tag,'p');
      return {id:'',className:'',textContent:'',setAttribute(){}};
    }},
    renderWithdrawalPanel(){calls.renders++},
    toast(msg){calls.notifications.push(msg)},
    console:{error(...args){calls.errors.push(args)}},
    fetch:async (url,opts)=>{
      calls.fetch++;
      assert.match(String(url), /\/api\/consultations$/);
      assert.equal(opts.method,'POST');
      return new Response(JSON.stringify(reply),{
        status:201,headers:{'content-type':'application/json'}
      });
    }
  });
  vm.runInContext("const ACCESS_KEY='ekodi-insurance-consultation-access-v1';const MAX_ACCESS_ITEMS=256;\n"+
    accessFunctions+writeFunctions,ctx);
  return { ctx, calls, form, button, warnings, snapshot:()=>Object.fromEntries(data),
    run:()=>ctx.submitHandoff({shareConsent:true,name:'Synthetic',contact:'010-0000-0000'},form) };
}

test('21 or more valid revocation credentials are retained, not silently discarded',()=>{
  const h=createHarness();
  h.ctx.writeAccess(largeEntries);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY]).length,21);
  assert.equal(h.calls.renders,1);
  assert.equal(h.ctx.canPersistRevocationAccess(),true);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY]).length,21);
  assert.equal(h.calls.remove.length,1,'temporary storage-check key must be cleaned');
  assert.throws(()=>h.ctx.writeAccess(Array.from({length:257},(_,i)=>({
    id:'con_'+i,accessToken:'ic_'+i
  }))),/capacity/);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY]).length,21);
});

test('corrupt, disabled, or full browser storage blocks server submission entirely',async()=>{
  const cases=[
    { initial:{ [ACCESS_KEY]:'{invalid' } },
    { blocked:true },
    { initial:{ [ACCESS_KEY]:JSON.stringify(Array.from({length:256},(_,i)=>({
      id:'con_'+i,accessToken:'ic_'+i
    }))) } },
    { initial:{ [ACCESS_KEY]:JSON.stringify([{id:'known',accessToken:null}]) } }
  ];
  for(const options of cases){
    const h=createHarness(options);
    const before=h.snapshot();
    await h.run();
    assert.equal(h.calls.fetch,0);
    assert.equal(h.form.resetCount,0);
    assert.equal(h.calls.notifications.length,1);
    assert.match(h.calls.notifications[0], /보내지 않았습니다/);
    assert.equal(h.button.disabled,false);
    assert.deepEqual(h.snapshot(),before,'no credentials may be removed by preflight');
  }
});

test('accepted server submission with failed browser token storage is not mislabeled as network failure',async()=>{
  const h=createHarness({failAccessWrite:true});
  await h.run();
  assert.equal(h.calls.fetch,1);
  assert.equal(h.form.resetCount,0,'do not clear form after failed token save');
  assert.equal(h.warnings.length,1);
  assert.match(h.warnings[0].textContent,/서버에 접수되었지만/);
  assert.match(h.warnings[0].textContent,/중복 요청을 보내지 말고/);
  assert.match(h.calls.notifications.at(-1),/서버 상담요청은 접수되었습니다/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.snapshot()[ACCESS_KEY],undefined);
});

test('successful consented request saves token before clearing and reporting acceptance',async()=>{
  const h=createHarness({initial:{[ACCESS_KEY]:JSON.stringify(largeEntries)}});
  await h.run();
  assert.equal(h.calls.fetch,1);
  const items=JSON.parse(h.snapshot()[ACCESS_KEY]);
  assert.equal(items.length,22);
  assert.equal(items[0].id,'con_new');
  assert.equal(items[0].accessToken,'ic_synthetic_new');
  assert.equal(items.at(-1).id,'con_test-20');
  assert.equal(h.form.resetCount,1);
  assert.equal(h.button.disabled,false);
  assert.match(h.calls.notifications.at(-1),/등록되었습니다/);
  assert.equal(h.warnings.length,0);
});

test('malformed successful response cannot falsely claim local revocation record was saved',async()=>{
  const h=createHarness({reply:{consultation:{id:'con_new'},accessToken:null}});
  await h.run();
  assert.equal(h.calls.fetch,1);
  assert.equal(h.form.resetCount,0);
  assert.equal(h.warnings.length,1);
  assert.equal(h.snapshot()[ACCESS_KEY],undefined);
});

test('bridge never exposes tokens to URL or logs complete error payload',()=>{
  assert.doesNotMatch(writeFunctions, /console\.error\([^)]*error\)/);
  assert.doesNotMatch(writeFunctions, /\bwindow\.location\s*=|\blocation\.href\s*=/);
  assert.match(accessFunctions,/MAX_ACCESS_ITEMS/);
  assert.doesNotMatch(accessFunctions,/items\.slice\(0,\s*20\)/);
});
