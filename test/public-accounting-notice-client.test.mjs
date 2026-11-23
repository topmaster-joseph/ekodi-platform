import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {publicAccountingNoticePage} from '../public-accounting-notice-page.js';

const script=fs.readFileSync(new URL('../public-accounting-notice.js',import.meta.url),'utf8');
class Node{
  constructor(id=''){this.id=id;this.dataset={};this.events={};this.attrs={};this.children=[];this.textContent='';this.hidden=false;this.value='';}
  addEventListener(key,fn){this.events[key]=fn;}
  setAttribute(key,value){this.attrs[key]=String(value);}
  replaceChildren(...nodes){this.children=nodes;}
  append(...nodes){this.children.push(...nodes);}
  focus(){this.focused=true;}
}
function setup(){
  const ids=Object.fromEntries(['accountingYear','accountingStatus','accountingMonths','accountingRetry','accountingSummary','accountingMonthly'].map(id=>[id,new Node(id)]));
  const amounts=Object.fromEntries(['income','expense','balance'].map(key=>[key,new Node()]));
  const tabs=['summary','monthly'].map(key=>{const node=new Node();node.dataset.accountingTab=key;return node;});
  const pending=[];
  const document={body:{dataset:{accountingWorkspace:'ekodibiz'}},getElementById:id=>ids[id]||null,
    querySelector:selector=>amounts[selector.match(/data-total="([^"]+)"/)?.[1]]||null,
    querySelectorAll:()=>tabs,createElement:tag=>new Node(tag)};
  const fetch=(url,options)=>new Promise(resolve=>pending.push({url:String(url),options,resolve}));
  runInNewContext(script,{document,URL,AbortController,fetch,location:{origin:'https://ekodi.kr'}});
  return {ids,amounts,tabs,pending};
}
const flush=()=>new Promise(setImmediate);
function sample(y='2026'){
  return {ok:true,workspace:'ekodibiz',organization:'에코디비즈',year:y,years:[y],
    total:{count:1,income:150,expense:50,balance:100},
    months:Array.from({length:12},(_,i)=>({month:y+'-'+String(i+1).padStart(2,'0'),count:i===0?1:0,
      income:i===0?150:0,expense:i===0?50:0,balance:i===0?100:0}))};
}
const ok=data=>({ok:true,json:async()=>data});
const fail=()=>({ok:false,json:async()=>({error:'UNAVAILABLE'})});

test('network error keeps totals unknown and enables recovery',async()=>{
  const ui=setup();
  assert.equal(ui.amounts.balance.textContent,'—');
  ui.pending[0].resolve(fail());
  await flush();
  assert.equal(ui.amounts.income.textContent,'—');
  assert.equal(ui.ids.accountingRetry.hidden,false);
  assert.match(ui.ids.accountingStatus.textContent,/다시 조회/);
});
test('stale year response cannot overwrite the current year; next error clears values',async()=>{
  const ui=setup();
  ui.ids.accountingYear.value='2025';ui.ids.accountingYear.events.change();
  ui.ids.accountingYear.value='2026';ui.ids.accountingYear.events.change();
  assert.equal(ui.pending.length,3);
  ui.pending[2].resolve(ok(sample('2026')));await flush();
  assert.equal(ui.amounts.balance.textContent,'100원');
  ui.pending[1].resolve(ok(sample('2025')));await flush();
  assert.match(ui.ids.accountingStatus.textContent,/2026년/);
  ui.ids.accountingYear.value='2024';ui.ids.accountingYear.events.change();
  assert.equal(ui.amounts.balance.textContent,'—');
  ui.pending[3].resolve(fail());await flush();
  assert.equal(ui.ids.accountingRetry.hidden,false);
  assert.equal(ui.amounts.balance.textContent,'—');
});
test('valid zero-count summary is an empty state rather than zero won',async()=>{
  const ui=setup();ui.pending[0].resolve(ok({ok:true,workspace:'ekodibiz',organization:'에코디비즈',year:'2026',years:['2026'],total:{count:0,income:0,expense:0,balance:0}}));
  await flush();assert.equal(ui.amounts.income.textContent,'—');assert.match(ui.ids.accountingStatus.textContent,/집계자료 없음/);
});
test('keyboard tabs update panels and ARIA relationships',()=>{
  const ui=setup();let prevented=false;
  ui.tabs[0].events.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(ui.tabs[1].attrs['aria-selected'],'true');
  assert.equal(ui.ids.accountingMonthly.hidden,false);assert.equal(ui.ids.accountingSummary.hidden,true);
  assert.equal(ui.ids.accountingMonthly.attrs['aria-labelledby'],ui.tabs[1].id);
});
test('public notice does not mislabel net income as bank balance',async()=>{
  const html=await publicAccountingNoticePage('/ekodibiz/accounting').text();
  assert.match(html,/연간 수지차액/);assert.match(html,/실제 계좌 잔액과 다릅니다/);
  assert.match(html,/id="accountingRetry"/);assert.doesNotMatch(html,/>0원<\/strong>/);
});
