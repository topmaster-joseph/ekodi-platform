#!/usr/bin/env node
// EKODI first-party finance disclosure and guest privacy canary.
// Read-only HTTPS, fixed EKODI origins; no TinyFish, remote desktop, login,
// cookies, tokens, uploads, or credentials. Never returns ledger data.
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const MOUNTS=Object.freeze([
  {name:'canonical',origin:'https://ekodi.kr',prefix:'/seonammedi'},
  {name:'independent',origin:'https://seonammedi.kr',prefix:''},
]);
const ORIGIN='https://ekodi.kr';
const timeoutMs=15000;
function must(condition,code){if(!condition)throw Error(code)}
async function get(fetchImpl,url){
  const response=await fetchImpl(url,{
    method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',
    headers:{accept:'text/html,application/json'},signal:AbortSignal.timeout(timeoutMs)
  });
  must(response&&typeof response.status==='number','FINANCE_PROBE_INVALID_RESPONSE');
  return response;
}
function inspectDisclosure(html){
  const section=html.match(/<section\b[^>]*class="[^"]*committee-finance-disclosure[^"]*"[^>]*>[\s\S]*?<\/section>/i)?.[0]||'';
  must(section,'FINANCE_PUBLIC_SUMMARY_MISSING');
  const labelTexts=[...section.matchAll(/<dt(?:\s[^>]*)?>([\s\S]*?)<\/dt>/gi)]
    .map(m=>m[1].replace(/<[^>]*>/g,'').trim());
  must(JSON.stringify(labelTexts)===JSON.stringify(['기간','총수입','총지출','잔액']),
    'FINANCE_PUBLIC_FIELDS_NOT_AGGREGATE_ONLY');
  must((section.match(/<dd(?:\s[^>]*)?>/gi)||[]).length===4,
    'FINANCE_PUBLIC_VALUES_NOT_FOUR');
  must(/투명성/.test(section)&&/비상대책위원회에 문의/.test(section),
    'FINANCE_PUBLIC_PURPOSE_OR_CONTACT_MISSING');
  must(!/<(?:table|tr|input)\b/i.test(section)&&!/data-finance-(?:edit|delete)|finance-item/.test(section),
    'FINANCE_PUBLIC_PRIVATE_ROW_MARKER');
  return {aggregateFields:4,purposeAndInquiry:true};
}
export async function verifySeonammediFinanceFirstParty({fetchImpl=fetch}={}){
  const checked=[];
  for(const {name,origin,prefix} of MOUNTS){
    const response=await get(fetchImpl,origin+prefix+'/');
    must(response.status===200,'FINANCE_PUBLIC_'+name.toUpperCase()+'_HTTP_'+response.status);
    const result=inspectDisclosure(await response.text());
    checked.push({mount:name,http:response.status,...result});
  }
  const page=await get(fetchImpl,ORIGIN+'/api/seonammedi/page-data');
  must(page.status===200,'FINANCE_PUBLIC_API_HTTP_'+page.status);
  const data=await page.json().catch(()=>null);
  const finance=data?.finance;
  must(data?.ok===true&&finance?.raised===null&&finance?.spent===null&&
    finance?.balance===null&&Array.isArray(finance?.entries)&&finance.entries.length===0,
    'FINANCE_PUBLIC_API_PRIVATE_LEDGER_LEAK');
  const admin=await get(fetchImpl,ORIGIN+'/api/seonammedi/admin/finance');
  must(admin.status===401||admin.status===403,'FINANCE_ADMIN_GUEST_GATE_'+admin.status);
  must(/no-store/i.test(admin.headers?.get?.('cache-control')||''),
    'FINANCE_ADMIN_NO_STORE_MISSING');
  const authBody=await admin.json().catch(()=>null);
  must(authBody?.ok===false&&typeof authBody.error==='string',
    'FINANCE_ADMIN_GUEST_ERROR_CONTRACT');
  return {
    ok:true,provider:'ekodi-first-party-native-http',readOnly:true,
    externalBrowserServiceCalls:0,credentialUse:false,
    publicSurfaces:checked,publicApi:'aggregate-only-separate',
    adminGuestStatus:admin.status
  };
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  verifySeonammediFinanceFirstParty().then(result=>{
    process.stdout.write(JSON.stringify(result)+'\n');
  }).catch(error=>{
    // Error codes only, no network URLs, source DOM, tokens or account details.
    const code=/^FINANCE_[A-Z0-9_]+$/.test(error?.message||'')?error.message:'FINANCE_FIRST_PARTY_PROBE_FAILED';
    process.stderr.write(JSON.stringify({ok:false,code})+'\n');
    process.exitCode=1;
  });
}
