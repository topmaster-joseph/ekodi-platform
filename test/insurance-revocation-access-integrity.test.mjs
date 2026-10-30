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
const customerRevoke = extract('  async function revokeConsultation(', '  function renderWithdrawalPanel(');
const ACCESS_KEY='ekodi-insurance-consultation-access-v1';
const largeEntries=Array.from({length:21},(_,i)=>({
  id:'con_test-'+i, accessToken:'ic_synthetic_'+i, status:'new'
}));

function createHarness({ initial = {}, blocked = false, failAccessWrite = false, revokeStatus = 200,
  reply = { consultation: { id:'con_new', status:'new', createdAt:'2026-10-30' }, accessToken:'ic_synthetic_new' }
} = {}) {
  const data=new Map(Object.entries(initial));
  const calls={ fetch:0, revokes:0, renders:0, notifications:[], errors:[], set:[], remove:[] };
  const button={ disabled:false, after(node){warnings.push(node)} };
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
      assert.equal(opts.method,'POST');
      assert.equal(opts.credentials,'omit','never send session cookies to insurance API');
      assert.equal(opts.redirect,'error','never transmit bearer token to redirected host');
      assert.equal(opts.cache,'no-store');
      if(String(url).endsWith('/revoke')){
        calls.revokes++;
        assert.match(String(url), /\/api\/consultations\/con_new\/revoke$/);
        assert.deepEqual(JSON.parse(opts.body),{accessToken:'ic_synthetic_new'});
        return new Response(JSON.stringify({ consultation:{ status:'revoked' } }),{
          status:revokeStatus,headers:{'content-type':'application/json'}
        });
      }
      assert.match(String(url), /\/api\/consultations$/);
      return new Response(JSON.stringify(reply),{
        status:201,headers:{'content-type':'application/json'}
      });
    }
  });
  vm.runInContext("const ACCESS_KEY='ekodi-insurance-consultation-access-v1';const MAX_ACCESS_ITEMS=256;const API='https://insurance.internal.invalid';\n"+
    accessFunctions+writeFunctions+customerRevoke,ctx);
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
  const older=Array.from({length:257},(_,i)=>({
    id:'con_'+i,accessToken:'ic_'+i
  }));
  h.ctx.writeAccess(older);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY]).length,257,'historical over-capacity tokens stay available');
  assert.throws(()=>h.ctx.saveAccess({ id:'con_new',status:'new' },'ic_new'),/capacity/);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY]).length,257,'failed new create must not remove existing tokens');
  h.ctx.writeAccess(h.ctx.loadAccess().filter(item=>item.id!=='con_0'));
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY]).length,256,'customer may still revoke old tokens');
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
  assert.equal(h.calls.fetch,2,'one accepted server POST and one automatic revoke');
  assert.equal(h.calls.revokes,1);
  assert.equal(h.form.resetCount,0,'do not clear form after failed token save');
  assert.equal(h.warnings.length,1);
  assert.match(h.warnings[0].textContent,/접수 직후 자동 철회되었습니다/);
  assert.match(h.calls.notifications.at(-1),/자동 철회했습니다/);
  assert.equal(h.button.disabled,false,'retry is permitted only after confirmed cancellation');
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
  assert.match(h.warnings[0].textContent,/자동 철회도 확인되지 않았습니다/);
  assert.equal(h.button.disabled,true,'unknown server outcome must block repeated submit');
  assert.equal(h.calls.revokes,0);
  assert.equal(h.snapshot()[ACCESS_KEY],undefined);
});

test('bridge never exposes tokens to URL or logs complete error payload',()=>{
  assert.doesNotMatch(writeFunctions, /console\.error\([^)]*error\)/);
  assert.doesNotMatch(writeFunctions, /\bwindow\.location\s*=|\blocation\.href\s*=/);
  assert.match(accessFunctions,/MAX_ACCESS_ITEMS/);
  assert.doesNotMatch(accessFunctions,/items\.slice\(0,\s*20\)/);
});


test('auto-revoke blocked by quota 429 is not retried and requires manual contact',async()=>{
  const h=createHarness({failAccessWrite:true,revokeStatus:429});
  await h.run();
  assert.equal(h.calls.fetch,2,'one create plus just one revoke, never repeated');
  assert.equal(h.calls.revokes,1);
  assert.equal(h.form.resetCount,0);
  assert.equal(h.warnings.length,1);
  assert.match(h.warnings[0].textContent,/자동 철회도 확인되지 않았습니다/);
  assert.match(h.warnings[0].textContent,/중복 신청하지 말고/);
  assert.equal(h.button.disabled,true);
  assert.equal(h.snapshot()[ACCESS_KEY],undefined);
});

test('after token was safely persisted, panel rendering errors do not trigger auto-revoke',async()=>{
  const h=createHarness();
  h.ctx.renderWithdrawalPanel=()=>{throw new Error('synthetic redraw failure')};
  await h.run();
  assert.equal(h.calls.fetch,1);
  assert.equal(h.calls.revokes,0);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY])[0].id,'con_new');
  assert.equal(h.form.resetCount,1);
  assert.equal(h.warnings.length,0);
});


test('customer-initiated revoke also prevents credential-bearing redirects',()=>{
  assert.match(customerRevoke, /credentials:\s*'omit'/);
  assert.match(customerRevoke, /redirect:\s*'error'/);
  assert.match(customerRevoke, /cache:\s*'no-store'/);
  assert.doesNotMatch(customerRevoke, /accessToken:\s*item\.accessToken.*(?:location|url)/);
});


test('post-save form exception preserves consultation and revoke token without auto-cancellation',async()=>{
  const h=createHarness();
  h.form.reset=()=>{throw new Error('synthetic redraw/reset failure')};
  await h.run();
  assert.equal(h.calls.fetch,1);
  assert.equal(h.calls.revokes,0);
  assert.equal(JSON.parse(h.snapshot()[ACCESS_KEY])[0].id,'con_new');
  assert.equal(h.button.disabled,false);
  assert.equal(h.warnings.length,0);
  assert.match(h.calls.notifications.at(-1),/철회 권한은 이 브라우저에 저장되었습니다/);
});


test('manual revoke reports server success even when local token deletion fails',async()=>{
  const record={ id:'con_new', accessToken:'ic_synthetic_new' };
  const raw=JSON.stringify([record]);
  const h=createHarness({initial:{[ACCESS_KEY]:raw},failAccessWrite:true});
  await h.ctx.revokeConsultation(record,h.button);
  assert.equal(h.calls.fetch,1);
  assert.equal(h.calls.revokes,1);
  assert.equal(h.snapshot()[ACCESS_KEY],raw,'the old token is preserved if write fails');
  assert.equal(h.warnings.length,1);
  assert.match(h.warnings[0].textContent,/서버 상담요청 철회는 완료되었습니다/);
  assert.equal(h.warnings[0].setAttribute instanceof Function,true);
  assert.match(h.calls.notifications.at(-1),/서버 철회는 완료되었지만/);
  assert.equal(h.button.disabled,true,'no duplicate bearer request after server success');
});

test('manual revoke removes only matched token and never follows redirected URL',async()=>{
  const record={ id:'con_new', accessToken:'ic_synthetic_new' };
  const retained={ id:'con_old', accessToken:'ic_synthetic_old' };
  const h=createHarness({initial:{[ACCESS_KEY]:JSON.stringify([record,retained])}});
  await h.ctx.revokeConsultation(record,h.button);
  assert.equal(h.calls.fetch,1);
  assert.equal(h.calls.revokes,1);
  assert.deepEqual(JSON.parse(h.snapshot()[ACCESS_KEY]),[retained]);
  assert.equal(h.warnings.length,0);
  assert.equal(h.button.disabled,true,'row is removed on success');
  assert.match(h.calls.notifications.at(-1),/철회하고 서버의 연락처/);
});

test('malformed existing revoke storage can never be overwritten as empty',async()=>{
  for(const raw of ['{broken','null','{}',JSON.stringify([{id:'con_new',accessToken:null}])]){
    const h=createHarness({initial:{[ACCESS_KEY]:raw}});
    assert.deepEqual(h.ctx.loadAccess(),[],'display can be empty but storage cannot mutate');
    assert.throws(()=>h.ctx.writeAccess([{ id:'con_new',accessToken:'ic_new' }]));
    assert.equal(h.snapshot()[ACCESS_KEY],raw);
    assert.equal(h.calls.renders,0);
    await h.ctx.revokeConsultation({id:'con_new',accessToken:'ic_synthetic_new'},h.button);
    assert.equal(h.calls.fetch,1,'server may accept a user-held valid revoke token');
    assert.equal(h.calls.revokes,1);
    assert.equal(h.snapshot()[ACCESS_KEY],raw,'corrupt prior browser data is never deleted');
    assert.equal(h.warnings.length,1,'server success and local failure must be distinguished');
  }
});

test('withdrawal panel states recovery needed instead of claiming no consultations for corrupted storage',()=>{
  const bridge = source.slice(source.indexOf('  function renderWithdrawalPanel()'),source.indexOf('  async function loadReferenceCatalog()'));
  assert.match(bridge,/try \{ items = readAccessStrict\(\); \}/);
  assert.match(bridge,/확인 필요/);
  assert.match(bridge,/기록을 삭제하거나 초기화하지 말고/);
  assert.match(bridge,/setAttribute\('role', 'alert'\)/);
});
