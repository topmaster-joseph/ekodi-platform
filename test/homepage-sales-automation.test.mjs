import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { buildHomepageSalesPlan as build } from '../homepage-sales-automation.js';
import { HOMEPAGE_PRICING as P, HOMEPAGE_AUDIENCES as A, estimateHomepageSubscription as estimate, ekodiBizHomepageServiceHtml, ekodiBizHomepageAdminHtml } from '../ekodibiz-homepage-service-page.js';
const created='2026-11-26T04:00:00Z';
const request={display_name:'테스트 단체',audience:'community',plan:'S1',contract:'monthly',options:{},created_at:created,mode:'consult'};
const make=(overrides={},now=Date.parse(created))=>build({...request,...overrides},P,A,estimate,now);

test('all six audiences start at 9900 without a setup fee and get specific guidance',()=>{
 for(const audience of A){const p=make({audience:audience.id});assert.equal(p.quote.monthly,9900);assert.equal(p.quote.setup,0);assert.ok(p.draft.includes(audience.guide));assert.ok(p.draft.includes('에코디비즈'));}
});
test('canonical estimator calculates annual/addon/discount totals; submitted amounts are ignored',()=>{
 const options={pages:2,booking:true,member:'y'};
 const p=make({plan:'S2',contract:'annual',options,monthly_estimate:1,firstPayment:1});
 assert.deepEqual(p.quote,estimate(P,{...options,member:true,plan:'S2',contract:'annual',social:0,lang:0,payment:false,logo:false,photo:false,nonprofit:false}));
 assert.ok(p.draft.includes('연납'));assert.ok(p.draft.includes('자격 확인'));
});
test('unknown options never silently imply a final quote',()=>{
 const p=make({options:undefined,monthly_estimate:999999});assert.equal(p.optionsKnown,false);assert.ok(p.draft.includes('접수 원문'));assert.equal(p.quote.monthly,9900);
});
test('first response is next business day at 18:00 Korea time, including Friday/weekend',()=>{
 assert.equal(make().dueAt,'2026-11-27T09:00:00.000Z');
 assert.equal(make({created_at:'2026-11-27T06:00:00Z'}).dueAt,'2026-11-30T09:00:00.000Z');
 assert.equal(make({created_at:'2026-11-28T06:00:00Z'}).dueAt,'2026-11-30T09:00:00.000Z');
});
test('replay produces identical tasks without fabricated contact/payment/revenue',()=>{
 const a=make(),b=make();assert.deepEqual(a,b);assert.equal(a.tasks.length,3);assert.equal(a.contactStatus,'unverified');assert.equal(a.paymentStatus,'unverified');assert.equal(a.confirmedRevenue,null);
 assert.equal(make({},Date.parse('2026-11-28')).overdue,true);
});
test('cancelled and published records leave the sales follow-up queue',()=>{
 for(const r of [{status:'cancelled'},{status:'published'},{published:true}]){const p=make(r);assert.equal(p.needsResponse,false);assert.equal(p.tasks.length,0);assert.equal(p.dueAt,null);assert.equal(p.confirmedRevenue,null);}
});
test('invalid date and unknown enums degrade visibly and booleans are strict',()=>{
 const p=make({created_at:'bad',audience:'bogus',plan:'__proto__',options:{booking:'false',nonprofit:'true'}});
 assert.equal(p.dueAt,null);assert.equal(p.audience,'personal');assert.equal(p.quote.monthly,9900);
});
test('serialized function runs in a clean browser context and uses text output',()=>{
 const f=vm.runInNewContext('('+build.toString()+')');const p=f(request,P,A,estimate,Date.parse(created));assert.equal(p.quote.monthly,9900);
 const html=ekodiBizHomepageServiceHtml();assert.ok(html.includes('id="salesPreview"'));assert.ok(html.includes("$('salesPreview').textContent="));assert.ok(html.includes('homepageSales:'));
 const admin=ekodiBizHomepageAdminHtml();assert.ok(admin.includes('영업 대기'));assert.ok(admin.includes('hpEsc(p.draft)'));assert.ok(admin.includes('data-hp-copy'));
 for(const page of [html,admin])for(const match of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){new vm.Script(match[1]);}
});

async function contactHarness(){
 let source=await readFile(new URL('../mail-contact.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const sent=[];
 const context={Request,Response,URL,Headers,TextEncoder,console:{log(){},error(){}},HOMEPAGE_PRICING:P,HOMEPAGE_AUDIENCES:A,estimateHomepageSubscription:estimate,buildHomepageSalesPlan:build,
 serviceAccountToken:async()=> 'test-token',sendGoogleMailMessage:async(token,message)=>{sent.push(message);return {id:'test-message'};},recordJournalInbox:async()=>false};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.handle=handleMailContactApi;',context);
 return {sent,handle:context.handle};
}
test('intake adds canonical proposal and tasks to existing fixed-owner notice without messaging the customer',async()=>{
 const h=await contactHarness();const response=await h.handle(new Request('https://ekodi.kr/mail/api/contact',{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({name:'테스트',email:'customer@example.invalid',subject:'구독 신청',message:'테스트 접수',source:'ekodibiz-homepage-subscription',homepageSales:{audience:'personal',plan:'S1',contract:'monthly',monthly:1,options:{}}})}),{ENVIRONMENT:'test'});
 assert.equal(response.status,200);assert.equal(h.sent.length,1);assert.equal(h.sent[0].to,'joseph@ekodi.kr');assert.equal(h.sent[0].replyTo,'customer@example.invalid');assert.ok(h.sent[0].body.includes('9,900원'));assert.ok(h.sent[0].body.includes('담당자 후속 업무'));assert.ok(h.sent[0].body.includes('https://ekodi.kr/homepage/admin'));
});
test('ordinary contact and honeypot retain current behavior',async()=>{
 const h=await contactHarness();const req=(body)=>new Request('https://ekodi.kr/mail/api/contact',{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify(body)});
 const base={email:'customer@example.invalid',subject:'일반 문의',message:'기존 내용'};
 assert.equal((await h.handle(req(base),{})).status,200);assert.ok(!h.sent[0].body.includes('자동 영업 안내'));
 await h.handle(req({...base,website:'bot',source:'ekodibiz-homepage-subscription',homepageSales:{}}),{});assert.equal(h.sent.length,1);
});
