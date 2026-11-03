#!/usr/bin/env node
// First-party, read-only Toss underwriting preflight. No payment, document upload, or approval.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const TARGETS=Object.freeze({
  homepage:'https://ekodi.kr/ekodibiz',
  translations:'https://ekodi.kr/_ekodi/ekodibiz/site.js',
  catalog:'https://ekodi.kr/ekodibiz/api/catalog',
  mallCheckout:'https://ekodi.kr/ekodimall/checkout/'
});
const MERCHANT=Object.freeze({name:'에코디비즈',registration:'213-13-01959',representative:'정찬균',phone:'010-3501-8542',href:'tel:+821035018542'});
const item=(status,evidence,next='')=>({status,evidence,...(next?{next}:{})});
const body=p=>p?.ok?String(p.body||''):'';
export function assessMerchantReview({pages,checkedAt=new Date().toISOString()}){
  const html=body(pages.homepage),localized=body(pages.translations),basket=body(pages.mallCheckout);
  let products=[];
  try { const data=JSON.parse(body(pages.catalog));if(Array.isArray(data.items))products=data.items; } catch {}
  const footers=[...localized.matchAll(/footerCompany:/g)].map(m=>localized.slice(m.index,m.index+550));
  const identity=[MERCHANT.name,MERCHANT.registration,MERCHANT.representative,MERCHANT.phone,MERCHANT.href].every(x=>html.includes(x))
    && /백련동1길|Baengnyeondong/.test(html) && pages.homepage?.ok;
  const phoneEveryLocale=pages.translations?.ok&&footers.length===6&&footers.every(s=>s.includes(MERCHANT.phone)&&s.includes(MERCHANT.href));
  const quoteOnly=products.length>0&&products.every(p=>p?.priceMode==='quote');
  const quoteCount=products.filter(p=>p?.priceMode==='quote').length;
  const pricedCandidateCount=products.filter(p=>p?.priceMode!=='quote'&&Number.isSafeInteger(p?.amount)&&p.amount>0).length;
  const consultation=pages.mallCheckout?.ok&&basket.includes('상담 바구니');
  const checks={
    publicMerchantDisclosure:item(identity?'pass':'blocked',
      identity?'Business name, representative, registration, address text and phone visible in public HTML.':'Public identity or contact incomplete/unavailable.',
      'Confirm name and address exactly match the business registration certificate.'),
    localizedMerchantContact:item(phoneEveryLocale?'pass':'blocked',
      phoneEveryLocale?'Six locale footerCompany entries contain the phone and tel URI.':'One or more localized legal footers missing/unavailable.'),
    approvedSellableProduct:item(quoteOnly?'blocked':'manual_required',
      products.length?String(products.length)+' Biz offers: '+String(quoteCount)+' quote-only; '+String(pricedCandidateCount)+' fixed-price candidates (not evidence of a real purchase).':'Public catalog missing or invalid.',
      'Owner must approve an actual SKU, price, fulfillment and refund conditions. No fictitious product or price.'),
    guestPurchase:item(consultation?'blocked':'manual_required',
      consultation?'Mall shows a consultation basket, not proof of guest-card checkout.':'Guest purchase flow has not been interactively verified.',
      'Verify final item/amount and guest checkout without forced social sign-in.'),
    testCardWindow:item('manual_required','A GET-only probe cannot verify an actual Toss TEST card-payment window.',
      'Run a real browser click-through with matching Toss TEST keys, not a live charge.'),
    sellerClassification:item('manual_required','Direct-sale versus third-party seller/platform status is not verified.',
      'Owner accurately identifies the merchant of record and any sub-sellers.'),
    registrationMatch:item('manual_required','Public footer cannot prove submitted registration/residential address.',
      'Owner checks application and private address within Toss; do not publish home address.'),
    documentsAndSubmission:item('manual_required','No uploads or reassessment requests are made.',
      'Owner uploads requested application and submits reassessment only after verified sale flow.')
  };
  const counts=Object.values(checks).reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
  return {schema:'ekodi-toss-merchant-review-v1',checkedAt,
    outcome:Object.values(checks).some(x=>x.status==='blocked')?'blocked':'human_verification_required',
    reviewRequestSubmitted:false,livePaymentsEnabledByAudit:false,checks,
    summary:{...counts,quoteOnlyOfferCount:quoteCount,merchantHomepage:TARGETS.homepage},
    source:'Public first-party GET endpoints only; not authenticated Toss review or visual card verification'};
}
export async function runMerchantReviewAudit(fetchImpl=fetch){
  const pages=Object.fromEntries(await Promise.all(Object.entries(TARGETS).map(async([key,url])=>{
    try {
      const response=await fetchImpl(url,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(12000),
        headers:{accept:key==='catalog'?'application/json':'text/html,application/javascript,*/*'}});
      return [key,{ok:response.ok,status:response.status,body:response.ok?(await response.text()).slice(0,650000):''}];
    }catch(error){return [key,{ok:false,status:0,error:String(error?.message||'network unavailable')}];}
  })));
  return assessMerchantReview({pages});
}
async function main(){
  const flags=process.argv.slice(2),i=flags.indexOf('--output');
  if(i>=0&&(!flags[i+1]||flags[i+1].startsWith('--')))throw new Error('An output file path is required');
  const report=await runMerchantReviewAudit(),json=JSON.stringify(report,null,2)+'\n';
  if(i>=0)await writeFile(flags[i+1],json,'utf8');
  console.log(json);
  if(flags.includes('--network-required')&&report.checks.publicMerchantDisclosure.status==='blocked'&&report.checks.localizedMerchantContact.status==='blocked')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error(String(e.message));process.exitCode=1;});
}
