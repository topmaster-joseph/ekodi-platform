import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifySeonammediFinanceFirstParty} from '../scripts/verify-seonammedi-finance-firstparty.mjs';

const disclosure=`<section class="committee-finance-disclosure"><dl>
<dt>기간</dt><dd>2026.10.29.~2026.11.03.</dd>
<dt>총수입</dt><dd>8,900,333원</dd>
<dt>총지출</dt><dd>10,672,100원</dd>
<dt>잔액</dt><dd>14,051,738원</dd>
</dl><p>시민에게 투명성을 높이고 자세한 사항은 비상대책위원회에 문의 바랍니다.</p></section>`;
const pageData={ok:true,page:{},finance:{raised:null,spent:null,balance:null,entries:[]}};
function mockFetch({publicHtml=disclosure,finance=pageData,adminStatus=401}={}){
  const seen=[];
  return {seen,fetch:async(url,options)=>{
    seen.push({url,options});
    if(url.endsWith('/api/seonammedi/page-data'))return new Response(JSON.stringify(finance),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
    if(url.endsWith('/api/seonammedi/admin/finance'))return new Response(JSON.stringify({ok:false,error:'authentication_required'}),{status:adminStatus,headers:{'content-type':'application/json','cache-control':'no-store'}});
    return new Response(publicHtml,{status:200,headers:{'content-type':'text/html'}});
  }};
}
test('independent EKODI finance canary verifies both mounts, public privacy, and 401 auth gate',async()=>{
  const x=mockFetch();
  const result=await verifySeonammediFinanceFirstParty({fetchImpl:x.fetch});
  assert.equal(result.ok,true);
  assert.equal(result.externalBrowserServiceCalls,0);
  assert.equal(result.credentialUse,false);
  assert.deepEqual(result.publicSurfaces.map(v=>v.mount),['canonical','independent']);
  assert.equal(result.adminGuestStatus,401);
  assert.equal(x.seen.length,4);
  assert.ok(x.seen.every(v=>v.options.method==='GET'&&v.options.credentials==='omit'&&v.options.redirect==='manual'));
  assert.ok(x.seen.every(v=>/https:\/\/(ekodi\.kr|seonammedi\.kr)\//.test(v.url)));
});
test('rejects leaking private public API and guest finance access',async()=>{
  await assert.rejects(verifySeonammediFinanceFirstParty({fetchImpl:mockFetch({finance:{...pageData,finance:{...pageData.finance,entries:[{amount:1}]}}}).fetch}),/FINANCE_PUBLIC_API_PRIVATE_LEDGER_LEAK/);
  await assert.rejects(verifySeonammediFinanceFirstParty({fetchImpl:mockFetch({adminStatus:200}).fetch}),/FINANCE_ADMIN_GUEST_GATE_200/);
});
test('rejects extra public ledger fields and missing transparency purpose',async()=>{
  await assert.rejects(verifySeonammediFinanceFirstParty({fetchImpl:mockFetch({publicHtml:disclosure.replace('</dl>','<dt>거래처</dt><dd>private</dd></dl>')}).fetch}),/FINANCE_PUBLIC_FIELDS_NOT_AGGREGATE_ONLY/);
  await assert.rejects(verifySeonammediFinanceFirstParty({fetchImpl:mockFetch({publicHtml:disclosure.replace('투명성을','내용을')}).fetch}),/FINANCE_PUBLIC_PURPOSE_OR_CONTACT_MISSING/);
});
test('first-party browser path does not require TinyFish or a legacy browser connector',async()=>{
  const script=await readFile(new URL('../scripts/verify-seonammedi-finance-firstparty.mjs',import.meta.url),'utf8');
  const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8');
  assert.match(workflow,/node scripts\/verify-seonammedi-finance-firstparty\.mjs/);
  assert.doesNotMatch(script,/import\s+.*(?:tinyfish|opera|desktop.commander)/i);
  assert.match(script,/credentialUse:false/);
});
