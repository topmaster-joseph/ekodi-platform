// Merchant-approved public price book. Publishing a tariff NEVER enables checkout, signing or fulfilment.
// The offer remains an EKODIBIZ independent service, not a government grant application fee.
import {ASSISTANCE_PLANS,assistanceCatalogue} from './assistance-catalog.js';

export const ASSISTANCE_PRICEBOOK_VERSION='ekodibiz-assistance-pricebook-v1';
const clean=(s,n=80)=>String(s??'').trim().slice(0,n);
const safeAmount=v=>Number.isSafeInteger(v)&&v>=0&&v<=100_000_000;

export function approveAssistancePricebook(input={}){
  const version=clean(input.policyVersion,64);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,63}$/.test(version))throw Error('invalid_policy_version');
  if(input.merchantApproved!==true||input.publicDisclosureApproved!==true||input.noGuaranteeAcknowledged!==true)
    throw Error('merchant_price_approval_required');
  if(!Array.isArray(input.items)||input.items.length!==ASSISTANCE_PLANS.length)
    throw Error('pricebook_items_required');
  const seen=new Set();
  const prices=ASSISTANCE_PLANS.map(plan=>{
    const matching=input.items.filter(p=>p?.id===plan.id);
    if(matching.length!==1||seen.has(plan.id))throw Error('pricebook_item_duplicate_or_missing');
    seen.add(plan.id);
    const amount=matching[0].amount;
    if(plan.free&&amount!==0)throw Error('information_must_remain_free');
    if(!plan.free&&amount!==null&&!safeAmount(amount))throw Error('pricebook_amount_invalid');
    if(matching[0].vatIncluded!==true||matching[0].currency!=='KRW')throw Error('pricebook_vat_krw_required');
    return {id:plan.id,amount,vatIncluded:true,currency:'KRW'};
  });
  if(prices.every(p=>p.amount===null||p.id==='information'))throw Error('at_least_one_service_price_required');
  return {format:ASSISTANCE_PRICEBOOK_VERSION,policyVersion:version,items:prices,
    merchant:'EKODIBIZ',affiliatedWithIssuingAgency:false,
    notice:'공고 주관기관과 무관한 에코디비즈 민간 서비스 표준요금입니다. 개별 계약서 확정과 결제는 별도 절차이며 지원사업 선정·보조금 지급을 보장하지 않습니다.'};
}

export function catalogFromApprovedPricebook(env={},row=null){
  const fallback=assistanceCatalogue(env);
  if(!row||row.status!=='approved'||typeof row.items_json!=='string')return fallback;
  try{
    const saved=JSON.parse(row.items_json);
    const normalized=approveAssistancePricebook({...saved,
      merchantApproved:true,publicDisclosureApproved:true,noGuaranteeAcknowledged:true});
    if(normalized.policyVersion!==row.policy_version)return fallback;
    const lookup=new Map(normalized.items.map(p=>[p.id,p]));
    return fallback.map(plan=>{
      if(plan.free)return plan;
      const fee=lookup.get(plan.id);
      return {...plan,price:fee&&fee.amount!==null?
        {kind:'fixed',amount:fee.amount,currency:'KRW',vatIncluded:true,policyVersion:normalized.policyVersion}:
        {kind:'quote_required',amount:null,currency:'KRW',vatIncluded:null,policyVersion:normalized.policyVersion}};
    });
  }catch{return fallback}
}

export async function loadApprovedAssistancePricebook(env={}){
  if(typeof env?.DB?.prepare!=='function')return null;
  try{
    return await env.DB.prepare("SELECT policy_version,items_json,approved_at,approved_by,status FROM ai_assistance_pricebooks WHERE status='approved' ORDER BY approved_at DESC, rowid DESC LIMIT 1").first();
  }catch{
    // Migration is additive; existing live quote-request flow must remain usable if the pricebook isn't ready.
    return null;
  }
}
