import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {routeVolunteer} from '../volunteer-module.js';

const env={DATA_ENABLED:'false',ASSETS:{fetch:async()=>new Response('/* css */',{status:200})}};
const handlers={
  json:(_env,data,status)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}),
  withHeaders:(_env,response)=>response
};
const detail=()=>routeVolunteer(new Request('https://ekodi.kr/volunteer/activities/2026-coal-delivery'),env,handlers);

test('application page offers accessible Korean-English switching and an explicitly visible protected admin link',async()=>{
 const response=await detail(),html=await response.text();
 assert.equal(response.status,200);
 for(const marker of [
  'data-v-lang="ko" aria-pressed="true"','data-v-lang="en" aria-pressed="false"',
  'data-v-i18n="formTitle"','data-v-i18n="privacyDetails"','data-v-i18n="photoConsent"',
  'data-v-i18n="venue"','data-v-i18n="deadline"','data-v-i18n="startApplication"',
  'href="/volunteer/admin" data-v-i18n="adminLink"','data-v-placeholder="namePlaceholder"',
  'data-v-i18n="safetyNote"','name="privacyConsent"','name="photoConsent"'
 ])assert.ok(html.includes(marker),marker);
 assert.match(html,/<a class="outline volunteer-admin-link" href="\/volunteer\/admin"/);
 assert.match(html,/role="group" aria-label="Language \/ 언어"/);
 assert.doesNotMatch(html,/href="[^"]*\/auth\/[^"]*token/);
 const asset=await readFile(new URL('../space/volunteer.js',import.meta.url),'utf8');
 const keys=[...html.matchAll(/data-v-i18n="([^"]+)"/g)].map(x=>x[1]);
 const english=asset.slice(asset.indexOf('const english='),asset.indexOf('const messages='));
 for(const key of keys)assert.ok(english.includes(key+':'),'missing English text: '+key);
 const css=await readFile(new URL('../space/volunteer.css',import.meta.url),'utf8');
 assert.match(css,/\.volunteer-language button\[aria-pressed=true\]/);
 assert.match(css,/\.volunteer-admin-link/);
});

test('language changes keep typed data, preserve API payload, and translate submission results',async()=>{
 const source=await readFile(new URL('../space/volunteer.js',import.meta.url),'utf8');
 const createNode=(text='',dataset={})=>({
  dataset,textContent:text,placeholder:'',attributes:{},listeners:{},
  addEventListener(type,cb){this.listeners[type]=cb},
  setAttribute(key,value){this.attributes[key]=String(value)},
  getAttribute(key){return this.attributes[key]||null},
  focus(){}
 });
 const node=(text,key)=>createNode(text,{vI18n:key});
 const title=node('온라인 신청서','formTitle');
 const privacy=node('개인정보 수집·이용에 동의합니다. *','privacyHeading');
 const adminLink=node('관리자 페이지','adminLink');
 const eventDate=node('2026년 12월 5일(토) 오전 10시','eventDate');
 const checking=node('실시간 접수 확인 중','checking');
 const input=createNode('',{vPlaceholder:'namePlaceholder'});input.placeholder='이름을 입력하세요';
 const ko=createNode('한국어',{vLang:'ko'}),en=createNode('English',{vLang:'en'});
 const volunteerAction=createNode('봉사 참여 신청',{vApplyMode:'volunteer'}),donationAction=createNode('연탄 후원 신청',{vApplyMode:'pledge'});
 const mode=createNode();mode.value='volunteer';
 const party=createNode();party.value='2';
 const bricks=createNode();bricks.value='10';
 const partyBox=createNode(),pledgeBox=createNode(),amount=createNode();
 const button=createNode('신청 접수하기',{vI18n:'submit'});
 const message=createNode();message.dataset.state='';
 const fields={name:'Kim Volunteer',phone:'010-1234-5678',affiliation:'Mokpo School',
   mode:'volunteer',partySize:'2',bricks:'0',note:'Please contact before arrival',
   privacyConsent:'on',photoConsent:'',website:''};
 const form={
  dataset:{campaign:'2026-coal-delivery'},
  listeners:{},elements:{namedItem(name){return {mode,partySize:party,bricks}[name]}},
  querySelector(sel){
   const nodes={
    '[data-volunteer-party]':partyBox,'[data-volunteer-pledge]':pledgeBox,
    '[data-pledge-total]':amount,'[type=submit]':button,'[data-status]':message
   };
   return nodes[sel]||null;
  },
  addEventListener(name,handler){this.listeners[name]=handler},
  reportValidity(){return true}
 };
 const location={href:'https://ekodi.kr/volunteer/activities/2026-coal-delivery'};
 const history={state:null,replaceState(_state,_title,url){location.href=String(url)}};
 const requests=[];
 const context={
  document:{
   documentElement:{lang:'ko'},title:'제12회 사랑의 연탄 배달 | 에코디 봉사',
   querySelector(sel){return sel==='[data-volunteer-form]'?form:sel==='[data-registration-state]'?checking:null},
   querySelectorAll(sel){
    if(sel==='[data-v-lang]')return [ko,en];
    if(sel==='[data-v-i18n]')return [title,privacy,adminLink,eventDate,checking,button];
    if(sel==='[data-v-placeholder]')return [input];
    if(sel==='[data-v-aria]')return [];
    if(sel==='[data-v-apply-mode]')return [volunteerAction,donationAction];
    return [];
   }
  },
  window:{},location,history,URL,
  Intl,Number,String,Map,Date,JSON,
  FormData:class {constructor(){}get(key){return fields[key]||null}},
  fetch:async(url,options)=>{
   requests.push({url,options});
   const status=String(url).endsWith('/status');
   return {
    ok:true,json:async()=>status
     ?{ok:true,registration_open:true,applied_count:3,capacity:50,waitlist_count:1}
     :{ok:true,receiptId:'abcdef12-1234-4abc-9012-123456789abc',participationStatus:'applied'}
   };
  },
  BroadcastChannel:class {postMessage(){}close(){}}
 };
 vm.runInNewContext(source,context,{filename:'volunteer.js'});
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.match(checking.textContent,/접수 중/);
 assert.equal(party.value,'2');
 en.listeners.click();
 assert.equal(context.document.documentElement.lang,'en');
 assert.equal(en.attributes['aria-pressed'],'true');
 assert.equal(ko.attributes['aria-pressed'],'false');
 assert.equal(title.textContent,'Volunteer & Donation Application');
 assert.equal(privacy.textContent,'I agree to the collection and use of personal information. *');
 assert.equal(adminLink.textContent,'Admin');
 assert.equal(eventDate.textContent,'Saturday, December 5, 2026 at 10:00 AM');
 assert.equal(input.placeholder,'Enter your name');
 assert.match(location.href,/\?lang=en$/);
 assert.equal(party.value,'2');
 await form.listeners.submit({preventDefault(){}});
 assert.equal(requests[1].url,'/volunteer/api/campaigns/2026-coal-delivery/apply');
 const saved=JSON.parse(requests[1].options.body);
 assert.equal(saved.name,'Kim Volunteer');
 assert.equal(saved.phone,'010-1234-5678');
 assert.equal(saved.partySize,2);
 assert.equal(saved.privacyConsent,true);
 assert.match(message.textContent,/Your volunteer application has been received/);
 assert.match(message.textContent,/abcdef12/);
 assert.equal(button.disabled,true);
 ko.listeners.click();
 assert.equal(context.document.documentElement.lang,'ko');
 assert.equal(title.textContent,'온라인 신청서');
 assert.equal(adminLink.textContent,'관리자 페이지');
 assert.match(message.textContent,/봉사 참여 신청이 접수됐습니다/);
 assert.equal(input.placeholder,'이름을 입력하세요');
 assert.equal(party.value,'2');
 assert.doesNotMatch(location.href,/\?lang=en/);
 donationAction.listeners.click();
 assert.equal(mode.value,'pledge');
 assert.equal(party.disabled,true);
 assert.equal(bricks.disabled,false);
 volunteerAction.listeners.click();
 assert.equal(mode.value,'volunteer');
 assert.equal(party.disabled,false);
 assert.equal(bricks.disabled,true);
});
