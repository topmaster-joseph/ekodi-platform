import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessMerchantReview,runMerchantReviewAudit,TARGETS } from '../scripts/toss-merchant-review-preflight.mjs';

const publicHtml='<footer>에코디비즈 대표 정찬균 사업자등록번호 213-13-01959 백련동1길 17-4 <a href="tel:+821035018542">010-3501-8542</a></footer>';
const locales=Array.from({length:6},(_,i)=>"footerCompany:'locale "+i+" <a href=\"tel:+821035018542\">010-3501-8542</a>',").join('\n');
const pages={
  homepage:{ok:true,body:publicHtml},
  translations:{ok:true,body:locales},
  catalog:{ok:true,body:JSON.stringify({items:[{id:'growth-30',priceMode:'quote'},{id:'event-complete',priceMode:'quote'}]})},
  mallCheckout:{ok:true,body:'<h1>상담 바구니</h1>'}
};
test('quote-only services and consultation basket cannot satisfy Toss sale review',()=>{
  const r=assessMerchantReview({pages});
  assert.equal(r.outcome,'blocked');
  assert.equal(r.checks.publicMerchantDisclosure.status,'pass');
  assert.equal(r.checks.localizedMerchantContact.status,'pass');
  assert.equal(r.checks.approvedSellableProduct.status,'blocked');
  assert.equal(r.checks.guestPurchase.status,'blocked');
  assert.equal(r.checks.testCardWindow.status,'manual_required');
  assert.equal(r.summary.quoteOnlyOfferCount,2);
  assert.equal(r.livePaymentsEnabledByAudit,false);
  assert.equal(r.reviewRequestSubmitted,false);
});
test('even a priced candidate is not automatically approved for real guest payment',()=>{
  const updated={...pages,catalog:{ok:true,body:JSON.stringify({items:[{id:'confirmed',priceMode:'fixed',amount:9900}]})},
    mallCheckout:{ok:true,body:'checkout'}};
  const r=assessMerchantReview({pages:updated});
  assert.equal(r.outcome,'human_verification_required');
  assert.equal(r.checks.approvedSellableProduct.status,'manual_required');
  assert.equal(r.checks.testCardWindow.status,'manual_required');
  assert.equal(r.checks.guestPurchase.status,'manual_required');
});
test('missing merchant telephone, locale or catalog cannot produce readiness success',()=>{
  const r=assessMerchantReview({pages:{...pages,homepage:{ok:true,body:'에코디비즈'},translations:{ok:false},catalog:{ok:false}}});
  assert.equal(r.outcome,'blocked');
  assert.equal(r.checks.publicMerchantDisclosure.status,'blocked');
  assert.equal(r.checks.localizedMerchantContact.status,'blocked');
});
test('audit makes only four public GET requests without customer or payment credentials',async()=>{
  const called=[];
  const responses=[pages.homepage,pages.translations,pages.catalog,pages.mallCheckout];
  const r=await runMerchantReviewAudit(async(url,options)=>{
    called.push([url,options.method]);
    const value=responses[Object.values(TARGETS).indexOf(url)];
    return {ok:true,status:200,text:async()=>value.body};
  });
  assert.deepEqual(called,Object.values(TARGETS).map(url=>[url,'GET']));
  assert.equal(r.outcome,'blocked');
  const src=readFileSync(new URL('../scripts/toss-merchant-review-preflight.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/method:\s*['"]POST['"]|requestPayment\(|confirmPayment\(|TOSS_SECRET_KEY|authorization:/);
});
