// Merchant-controlled quote and contract-review boundary for EKODIBIZ grant assistance.
// A customer acknowledgment is not a merchant-signed contract, a paid order or a PG receipt.
import {ASSISTANCE_PLANS} from './assistance-catalog.js';
const value=(x,n=250)=>String(x??'').trim().slice(0,n);
const https=(x)=>{
  try{const u=new URL(value(x,1000));if(u.protocol==='https:'&&!u.username&&!u.password)return u.href}catch{}
  return '';
};
const req=(x,name,n=250)=>{const v=value(x,n);if(!v)throw new Error(name+'_required');return v};
const amount=x=>Number.isSafeInteger(x)&&x>=0&&x<=100_000_000;
const validDate=(v)=>{const d=new Date(v);return Number.isFinite(d.getTime())&&d.toISOString()===v};
export const ASSISTANCE_CONTRACT_VERSION='ekodibiz-grants-service-quote-v1';
export function merchantContractReadiness(env={}){
  const merchant={
    name:value(env.EKODIBIZ_LEGAL_NAME,160),
    representative:value(env.EKODIBIZ_REPRESENTATIVE,100),
    businessNumber:value(env.EKODIBIZ_BUSINESS_NUMBER,40),
    address:value(env.EKODIBIZ_BUSINESS_ADDRESS,250),
    customerService:value(env.EKODIBIZ_CUSTOMER_SERVICE,120)
  };
  const documents={
    termsUrl:https(env.EKODIBIZ_ASSISTANCE_TERMS_URL),
    refundUrl:https(env.EKODIBIZ_ASSISTANCE_REFUND_URL),
    privacyUrl:https(env.EKODIBIZ_PRIVACY_POLICY_URL),
    termsVersion:value(env.EKODIBIZ_ASSISTANCE_TERMS_VERSION,60)
  };
  const blockers=[];
  if(!merchant.name||!merchant.representative||!merchant.address||!merchant.customerService||!/^\d{10}$/.test(merchant.businessNumber.replace(/-/g,'')))blockers.push('merchant_identity_incomplete');
  if(!documents.termsUrl||!documents.refundUrl||!documents.privacyUrl||!documents.termsVersion)blockers.push('legal_documents_unapproved');
  if(env.EKODIBIZ_ASSISTANCE_CONTRACT_APPROVED!=='true')blockers.push('merchant_contract_policy_not_approved');
  return {ready:blockers.length===0,merchant,documents,blockers};
}
export function normalizeMerchantQuote(input={},plans=[],env={},timestamp=new Date().toISOString()){
  const policy=merchantContractReadiness(env);
  if(!policy.ready)throw new Error('merchant_contract_configuration_required');
  if(!Array.isArray(plans)||plans.length<1||plans.length>6)throw new Error('request_plans_invalid');
  const eligible=new Map(ASSISTANCE_PLANS.map(p=>[p.id,p]));
  if(!Array.isArray(input.lineItems)||input.lineItems.length!==plans.length)throw new Error('line_items_incomplete');
  const selected=plans.map(p=>{
    const plan=eligible.get(p.id);
    const entries=input.lineItems.filter(x=>x?.id===p.id);
    if(!plan||entries.length!==1)throw new Error('invalid_quote_line');
    const cost=entries[0].amount;
    if(!amount(cost)||plan.free&&cost!==0)throw new Error('invalid_quote_amount');
    return {id:plan.id,label:plan.label,amount:cost,deliverables:plan.deliverables,limitations:plan.limitations};
  });
  if(input.vatIncluded!==true)throw new Error('vat_policy_requires_total_included');
  const days=Number(input.deliveryDays);
  if(!Number.isSafeInteger(days)||days<1||days>180)throw new Error('delivery_days_invalid');
  const expiresAt=value(input.expiresAt,35);
  if(!validDate(expiresAt)||Date.parse(expiresAt)<=Date.parse(timestamp)||Date.parse(expiresAt)>Date.parse(timestamp)+30*86400e3)throw new Error('quote_expiry_invalid');
  const total=selected.reduce((a,p)=>a+p.amount,0);
  if(!Number.isSafeInteger(total)||total>100_000_000)throw new Error('quote_total_invalid');
  const remark=value(input.notes,1500);
  return Object.freeze({
    contractVersion:ASSISTANCE_CONTRACT_VERSION,
    merchant:policy.merchant,documents:policy.documents,
    items:selected,totalAmount:total,currency:'KRW',vatIncluded:true,
    deliveryDays:days,expiresAt,
    notes:remark,
    disclaimers:['본 서비스는 공고 시행기관과 별개인 민간 유료 서비스입니다.','지원사업 선정·보조금 지급·최종 자격을 보장하지 않습니다.',
      '대행 제출은 별도 위임 및 신청자 확인이 필요합니다.','계약은 에코디비즈의 정식 전자서명과 양측 승인 후에 효력이 발생합니다.',
      '결제는 승인된 PG의 서버측 승인정보로만 확정합니다. 실제 입금이 확인되기 전 업무는 시작하지 않습니다.']
  });
}
export async function quoteDigest(snapshot){
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function normalizeQuoteAcknowledgment(input={},row,requestOwnerId,memberId,nowMs=Date.now()){
  if(!row||row.user_id!==memberId||requestOwnerId!==memberId)throw new Error('quote_not_found');
  if(row.status!=='issued')throw new Error('quote_not_open');
  if(Date.parse(row.expires_at)<=nowMs)throw new Error('quote_expired');
  if(input.digest!==row.digest)throw new Error('quote_version_conflict');
  if(input.termsAccepted!==true||input.privacyAcknowledged!==true||input.refundAcknowledged!==true||
     input.nonBindingAcknowledged!==true)throw new Error('contract_acknowledgment_required');
  if(value(input.typedName,80)!==value(row.applicant_name,80))throw new Error('signer_name_mismatch');
  return {acknowledgedBy:memberId,acknowledgmentType:'review_acknowledgment_not_e_signature',
    quoteId:row.id,digest:row.digest};
}
export function paymentReadiness(){
  // This platform only has a read-only EKODI Pay lobby today. It cannot initiate/verify a real charge.
  // A real PG adapter must independently attest the exact order, paid amount, business and signature.
  return {enabled:false,provider:'ekodipay',checkoutUrl:null,canMarkPaid:false,canStartWork:false,
    blockers:['merchant_countersigned_contract_required','certified_pg_server_confirmation_missing',
      'live_merchant_activation_missing'],message:'계약서 최종 서명 및 실제 결제 시스템 활성화 전에는 결제를 진행하거나 업무를 착수할 수 없습니다.'};
}
