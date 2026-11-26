import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {routeVolunteer} from '../volunteer-module.js';

const makeEnv=()=>({
  DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'test-public-key',
  ASSETS:{fetch:async()=>new Response('ok',{status:200})}
});
const handlers={
 json:(_env,data,status)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}),
 withHeaders:(_env,response,route)=>{response.headers.set('x-ekodi-route',route);return response}
};
const route=(path,opts)=>routeVolunteer(new Request('https://ekodi.kr'+path,opts),makeEnv(),handlers);
const rosterRoute='/volunteer/api/admin/registrations';
const request=(action='list',opts={})=>({
 method:'POST',
 headers:{'content-type':'application/json','origin':'https://ekodi.kr',...(opts.headers||{})},
 body:JSON.stringify({action,campaign:'2026-coal-delivery'})
});

test('operator page prominently separates applicants and donors without exposing private registrations in initial HTML',async()=>{
 const response=await route('/volunteer/admin');
 assert.equal(response.status,200);
 assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 const html=await response.text();
 assert.match(html,/연탄봉사 신청·후원 관리/);
 assert.match(html,/봉사 신청자 명단/);
 assert.match(html,/연탄 후원 약정/);
 assert.match(html,/data-volunteer-rows/);
 assert.match(html,/data-pledge-rows/);
 assert.match(html,/data-admin-table hidden/);
 assert.match(html,/data-admin-login[^>]+ hidden/);
 const css=await readFile(new URL('../space/volunteer.css',import.meta.url),'utf8');
 assert.match(css,/\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.volunteer-admin-summary/);
});

test('roster API is tenant operator only: rejects anonymous, forged origin and nonsnapshot actions',async()=>{
 const absent=await route(rosterRoute,request());
 assert.equal(absent.status,401);
 assert.equal((await absent.json()).error,'authentication_required');
 const cross=await route(rosterRoute,request('list',{headers:{origin:'https://untrusted.example'}}));
 assert.equal(cross.status,403);
 const forbiddenAction=await route(rosterRoute,request('confirm',{headers:{authorization:'Bearer ' + 'x'.repeat(35)}}));
 assert.equal(forbiddenAction.status,400);
});

test('roster API invokes the canonical tenant-scoped activity snapshot, not the donor pledge RPC',async()=>{
 const existing=globalThis.fetch;
 const requests=[];
 globalThis.fetch=async(url,opts)=>{
  requests.push({url,authorization:opts.headers.authorization,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({
   workspace:{slug:'ekodimission'},
   participants:[{name:'private test fixture',phone:'000-0000-0000',party_size:1,status:'applied'}],
   summary:{total:1}
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const response=await route(rosterRoute,request('list',{headers:{authorization:'Bearer '+'f'.repeat(36)}}));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.ok,true);
  assert.equal(data.participants.length,1);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://example.supabase.co/rest/v1/rpc/activity_admin_snapshot');
  assert.equal(requests[0].authorization,'Bearer '+'f'.repeat(36));
  assert.equal(requests[0].body.p_workspace_slug,'ekodimission');
  assert.equal(requests[0].body.p_activity_key,'261205-coal-delivery');
 }finally{globalThis.fetch=existing}
});

test('denied backend operator authorization cannot expose the participant list',async()=>{
 const existing=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({message:'ACTIVITY_ADMIN_FORBIDDEN'}),{status:403,headers:{'content-type':'application/json'}});
 try{
  const response=await route(rosterRoute,request('list',{headers:{authorization:'Bearer '+'z'.repeat(40)}}));
  assert.equal(response.status,403);
  const data=await response.json();
  assert.equal(data.error,'forbidden');
  assert.equal(data.participants,undefined);
 }finally{globalThis.fetch=existing}
});

test('admin script renders applicant and donor counts separately, and hides data until authorization',async()=>{
 const source=await readFile(new URL('../space/volunteer.js',import.meta.url),'utf8');
 const makeElement=()=>({
  textContent:'',hidden:false,children:[],dataset:{},attributes:{},listeners:{},
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=[...children]},
  addEventListener(type,cb){this.listeners[type]=cb},
  setAttribute(k,v){this.attributes[k]=String(v)}
 });
 const nodes={
  '[data-admin-status]':makeElement(),'[data-admin-login]':makeElement(),'[data-admin-table]':makeElement(),
  '[data-volunteer-rows]':makeElement(),'[data-pledge-rows]':makeElement(),
  '[data-volunteer-count]':makeElement(),'[data-people-count]':makeElement(),'[data-pledge-count]':makeElement(),
  '[data-volunteer-subcount]':makeElement(),'[data-pledge-subcount]':makeElement(),
  '[data-admin-refresh]':makeElement()
 };
 const admin={querySelector:s=>nodes[s]};
 const element=tag=>({...makeElement(),tagName:tag,colSpan:0});
 const requests=[];
 const mock={
  window:{addEventListener(){},EKODIMissionAuth:{getToken:()=> 'test-admin-token-'+ 'x'.repeat(36)}},
  document:{
   querySelector(sel){return sel==='[data-volunteer-admin]'?admin:null},
   createElement:element
  },
  Intl,Number,String,Date,JSON,Map,Promise,URL,
  sessionStorage:{getItem(){return null}},localStorage:{getItem(){return null}},
  fetch:async(path,opts)=>{
   requests.push({path,opts});
   return {
    ok:true,json:async()=>String(path).endsWith('registrations')
     ?{ok:true,participants:[
       {name:'Test Person A',phone:'010-1111-2222',party_size:1,status:'applied',submitted_at:'2026-11-26T00:12:00Z'},
       {name:'Test Person B',phone:'010-3333-4444',party_size:1,status:'applied',submitted_at:'2026-11-25T23:46:00Z'}
      ]}
     :{ok:true,pledges:[]}
   };
  }
 };
 vm.runInNewContext(source,mock,{filename:'volunteer.js'});
 for(let i=0;i<25;i++)await Promise.resolve();
 assert.equal(requests.length,2);
 assert.equal(nodes['[data-volunteer-count]'].textContent,'2');
 assert.equal(nodes['[data-people-count]'].textContent,'2');
 assert.equal(nodes['[data-pledge-count]'].textContent,'0');
 assert.equal(nodes['[data-volunteer-rows]'].children.length,2);
 assert.equal(nodes['[data-pledge-rows]'].children.length,1);
 assert.equal(nodes['[data-admin-table]'].hidden,false);
 assert.equal(nodes['[data-admin-login]'].hidden,true);
 assert.match(nodes['[data-admin-status]'].textContent,/봉사 신청자 2건 · 후원 약정 0건/);
});
