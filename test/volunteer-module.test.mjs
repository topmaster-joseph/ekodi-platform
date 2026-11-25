import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {volunteerCampaigns,routeVolunteer} from '../volunteer-module.js';
import {platformExecutionSurfaceForPath} from '../platform-route-registry.js';

const makeEnv=()=>({DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key',ASSETS:{fetch:async()=>new Response('body{color:green}',{status:200,headers:{'content-type':'text/css'}})}});
const handlers={
 json:(_env,data,status)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}),
 withHeaders:(_env,response,route)=>{response.headers.set('x-ekodi-route',route);return response}
};
const visit=(url,options)=>routeVolunteer(new Request('https://ekodi.kr'+url,options),makeEnv(),handlers);
const campaign=volunteerCampaigns['2026-coal-delivery'];

test('first volunteer campaign represents the source flyer without inventing an end time',()=>{
 assert.equal(campaign.key,'261205-coal-delivery');
 assert.equal(campaign.capacity,50);
 assert.equal(campaign.unitPrice,1300);
 assert.match(campaign.deadline,/11월 27일/);
 assert.match(campaign.date,/12월 5일/);
 assert.equal(campaign.bank,'농협 351-1185-2874-13');
});
test('canonical volunteer route reuses SPACE without path stripping',()=>{
 const spec=platformExecutionSurfaceForPath('/volunteer/activities/2026-coal-delivery');
 assert.equal(spec.id,'volunteer');
 assert.equal(spec.binding,'SPACE');
 assert.equal(spec.preservePrefix,true);
 assert.equal(spec.basePathAware,true);
});
test('volunteer index and mobile-friendly application are directly accessible',async()=>{
 const home=await visit('/volunteer');const page=await home.text();
 assert.equal(home.status,200);assert.match(page,/제12회 사랑의 연탄 배달/);
 assert.match(page,/href="\/volunteer\/activities\/2026-coal-delivery"/);
 const detail=await visit('/volunteer/activities/2026-coal-delivery');
 assert.equal(detail.status,200);
 const html=await detail.text();
 for(const marker of ['data-volunteer-form','name="mode"','name="partySize"','name="bricks"','name="privacyConsent"','name="photoConsent"','농협 351-1185-2874-13'])assert.ok(html.includes(marker),marker);
 assert.doesNotMatch(html,/name="birthdate"|name="gender"/);
 assert.doesNotMatch(html,/운영주체|대표 정찬균|사업자 소재지/);
 assert.equal((await visit('/volunteer/activities/not-an-event')).status,404);
});
test('EKODI volunteer and coal activity use two separate primary images, with original flyer retained',async()=>{
 const response=await visit('/volunteer');const html=await response.text();
 assert.equal(response.status,200);
 assert.match(html,/class="volunteer-brand-banner"/);
 assert.match(html,/1d0668d9-71d5-4fd7-8cbe-02a7e0a2e8a3\.png/);
 assert.match(html,/class="volunteer-coal-banner"/);
 assert.match(html,/b92a8103-0ca0-427e-aa18-c2ba667c711c\.png/);
 assert.match(html,/width="1672" height="481"/);
 assert.match(html,/width="1672" height="448"/);
 assert.match(html,/class="volunteer-original"/);
 assert.match(html,/0e814c8e-34ca-4768-b1c0-66c3f6a61a53\.jpg/);
 assert.match(html,/href="\/volunteer\/activities\/2026-coal-delivery">봉사·후원 신청하기<\/a>/);
 assert.doesNotMatch(html,/함께하는 마음이|자원봉사 참여부터 물품 후원까지/);
 assert.equal((html.match(/class="cta volunteer-primary"/g)||[]).length,1);
 const detail=await visit('/volunteer/activities/2026-coal-delivery');
 const detailHtml=await detail.text();
 assert.match(detailHtml,/b92a8103-0ca0-427e-aa18-c2ba667c711c\.png/);
 assert.doesNotMatch(detailHtml,/1d0668d9-71d5-4fd7-8cbe-02a7e0a2e8a3\.png/);
 assert.match(detailHtml,/href="#volunteer-form">신청서 작성하기/);
 const css=await readFile(new URL('../space/volunteer.css',import.meta.url),'utf8');
 assert.match(css,/\.volunteer-brand-banner img,\.volunteer-coal-banner img\s*\{[^}]*width:100%/);
 assert.match(css,/@media\(max-width:700px\)/);
});
test('rejects missing consent, invalid counts, cross-site origins, and untrusted campaigns',async()=>{
 const body={name:'테스트',phone:'010-1234-5678',mode:'both',partySize:1,bricks:10,privacyConsent:false};
 const route='/volunteer/api/campaigns/2026-coal-delivery/apply';
 const post=data=>visit(route,{method:'POST',headers:{'content-type':'application/json',origin:'https://ekodi.kr'},body:JSON.stringify(data)});
 assert.equal((await post(body)).status,400);
 assert.equal((await post({...body,privacyConsent:true,partySize:21})).status,400);
 assert.equal((await post({...body,privacyConsent:true,mode:'volunteer',bricks:10})).status,400);
 assert.equal((await visit(route,{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({...body,privacyConsent:true})})).status,403);
 assert.equal((await visit('/volunteer/api/campaigns/missing/apply',{method:'POST',body:'{}'})).status,404);
});
test('accepted pledge-only application uses canonical RPC but no volunteer capacity slot',async()=>{
 const existing=globalThis.fetch;let forwarded;
 globalThis.fetch=async(url,opts)=>{
   forwarded={url,body:JSON.parse(opts.body)};
   return new Response(JSON.stringify({ok:true,receipt_id:'b0c9e688-277e-4c1e-b553-9cfe5ca387fb',pledge_status:'pending'}),{headers:{'content-type':'application/json'}});
 };
 try{
   const result=await visit('/volunteer/api/campaigns/2026-coal-delivery/apply',{
     method:'POST',headers:{'content-type':'application/json',origin:'https://ekodi.kr'},
     body:JSON.stringify({name:'테스트',phone:'010-1234-5678',mode:'pledge',partySize:0,bricks:20,privacyConsent:true})
   });
   assert.equal(result.status,200);assert.equal((await result.json()).pledgeStatus,'pending');
   assert.equal(forwarded.url,'https://example.supabase.co/rest/v1/rpc/volunteer_submit_application');
   assert.equal(forwarded.body.p_party_size,0);assert.equal(forwarded.body.p_bricks,20);
   assert.equal(forwarded.body.p_workspace_slug,'ekodimission');
 }finally{globalThis.fetch=existing}
});
test('admin pledge endpoint never discloses donor data without a bearer token',async()=>{
 const response=await visit('/volunteer/api/admin/pledges',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'list',campaign:'2026-coal-delivery'})});
 assert.equal(response.status,401);
 const page=await visit('/volunteer/admin');
 assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 const html=await page.text();assert.doesNotMatch(html,/010-\d{4}-\d{4}/);
});
test('migration enforces RLS, tenant authorization, audit, and deadline checks',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261122140000_volunteer_module_first_campaign.sql',import.meta.url),'utf8');
 for(const guard of ['alter table public.volunteer_pledges enable row level security','revoke all on table public.volunteer_pledges','current_site_activity_contexts()','VOLUNTEER_DEADLINE_PASSED','VOLUNTEER_PLEDGE_ALREADY_CONFIRMED','volunteer_pledge_audit','activity_submit_participation('])assert.ok(sql.includes(guard),guard);
 assert.doesNotMatch(sql,/grant (?:select|update|insert) on table public\.volunteer_pledges to (?:anon|authenticated)/i);
});
