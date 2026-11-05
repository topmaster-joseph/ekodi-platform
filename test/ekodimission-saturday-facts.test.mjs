import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {resolveCommonScripture} from '../common-scripture-registry.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const source=await read('space/ekodimission-saturday.js');
const page=await read('space/ekodimission.page');
const css=await read('space/ekodimission.css');
const makeNode=()=>({textContent:'',hidden:false,dataset:{},append(){},replaceChildren(){}});

test('mission Saturday facts keep label and value aligned, with a second scripture line',()=>{
  assert.match(page,/<dl class="facts mission-saturday-facts">/);
  assert.match(page,/<dt>일정<\/dt><dd>/);
  assert.match(page,/<dt>장소<\/dt><dd>/);
  assert.match(page,/<dt>내용<\/dt><dd><span>성경토론 · 식사 · 교제<\/span><span class="mission-saturday-scripture">묵상 본문:/);
  assert.match(css,/\.mission-saturday-facts>div\{display:grid;grid-template-columns:3\.7rem minmax\(0,1fr\)/);
  assert.match(css,/\.mission-saturday-facts dd>span\{display:block\}/);
});

async function simulateScripture({passage='고린도전서 6:12-20',mode='approved'}={}){
  const nodes={
    form:{addEventListener(){},querySelector:()=>makeNode()},
    status:makeNode(), replies:makeNode(), date:makeNode(),count:makeNode(),
    scriptureStatus:makeNode(),scriptureLink:makeNode(),
    login:makeNode(),timeLabel:makeNode(),timeFact:makeNode(),
    intro:makeNode(),heading:makeNode()
  };
  const selectors={
    '[data-mission-saturday-form]':nodes.form,
    '[data-mission-saturday-status]':nodes.status,
    '[data-mission-saturday-replies]':nodes.replies,
    '[data-mission-saturday-date]':nodes.date,
    '[data-mission-saturday-count]':nodes.count,
    '[data-mission-saturday-scripture-status]':nodes.scriptureStatus,
    '[data-mission-saturday-scripture-link]':nodes.scriptureLink,
    '[data-mission-saturday-login]':nodes.login,
    '.mission-saturday-date span:last-child':nodes.timeLabel,
    '.facts dd':nodes.timeFact,
    '.activity-copy > p:not(.tag)':nodes.intro
  };
  const root={dataset:{},querySelector:key=>selectors[key]||null};
  const requests=[];
  const fetch=async url=>{
    requests.push(url);
    if(url==='/ekodimission/board/api/saturday'){
      return {ok:true,json:async()=>({ok:true,meeting:{date:'2026-11-07',time:'17:00',status:'scheduled'},replies:[],me:{authenticated:false}})};
    }
    if(url==='/api/public/scripture/common?date=2026-11-07'){
      if(mode==='network')throw new Error('unavailable');
      return {ok:mode!=='missing',json:async()=>({found:mode!=='missing',status:'approved',passage})};
    }
    throw new Error('unexpected URL '+url);
  };
  const document={
    querySelector:key=>key==='[data-mission-saturday]'?root:null,
    getElementById:key=>key==='mission-next-event'?nodes.heading:null,
    createElement:()=>makeNode(),
    addEventListener(){}
  };
  const window={addEventListener(){}};
  const location={search:'',hash:'',replace(){}};
  runInNewContext(source,{document,window,location,fetch,
    URLSearchParams,Date,Intl,AbortSignal,encodeURIComponent,
    setInterval:()=>1,clearInterval(){}});
  for(let tries=0;tries<12&&!requests.includes('/api/public/scripture/common?date=2026-11-07');tries++){
    await new Promise(resolve=>setTimeout(resolve,1));
  }
  await new Promise(resolve=>setTimeout(resolve,5));
  return {nodes,requests};
}

test('mission Saturday uses the scheduled date and approved canonical scripture',async()=>{
  assert.equal(resolveCommonScripture('2026-11-07').passage,'고린도전서 6:12-20');
  const {nodes,requests}=await simulateScripture();
  assert.deepEqual(requests,[
    '/ekodimission/board/api/saturday',
    '/api/public/scripture/common?date=2026-11-07'
  ]);
  assert.equal(nodes.timeFact.textContent,'토요일 오후 5:00');
  assert.equal(nodes.scriptureLink.textContent,'고린도전서 6:12-20');
  assert.equal(nodes.scriptureLink.href,'/bible/devotion/2026-11-07');
  assert.equal(nodes.scriptureLink.hidden,false);
  assert.equal(nodes.scriptureStatus.hidden,true);
});

test('unpublished and unavailable scripture never fabricate a reading',async()=>{
  const missing=await simulateScripture({mode:'missing'});
  assert.equal(missing.nodes.scriptureLink.hidden,true);
  assert.equal(missing.nodes.scriptureStatus.textContent,'본문 등록 전');
  const network=await simulateScripture({mode:'network'});
  assert.equal(network.nodes.scriptureLink.hidden,true);
  assert.equal(network.nodes.scriptureStatus.textContent,'본문 확인 불가');
});
