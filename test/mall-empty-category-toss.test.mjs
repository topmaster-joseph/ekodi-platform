import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=fs.readFileSync(new URL('../sites/ekodi-mall/assets/category-visibility.js',import.meta.url),'utf8');
const template=fs.readFileSync(new URL('../sites/ekodi-mall/src/index.template.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../sites/ekodi-mall/assets/home-refresh.css',import.meta.url),'utf8');
const cats=['general','living','book','gift'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function simulate({responses={},initialCards=[],selected='all'}={}){
  const nodes=Object.fromEntries(['all',...cats,'local'].map(id=>[id,{
    dataset:{filter:id},hidden:false,
    classList:{contains:(value)=>value==='active'&&id===selected},
    clicked:0,click(){this.clicked++;}
  }]));
  const links=Object.fromEntries([...cats,'local'].map(id=>[id,{dataset:{filterTarget:id},hidden:false}]));
  const headerLinks=Object.fromEntries([...cats,'local'].map(id=>[id,{dataset:{filterTarget:id},hidden:false}]));
  const grid={querySelectorAll:()=>initialCards};
  const filters={querySelectorAll:()=>Object.values(nodes)};
  const doc={
    querySelector:selector=>selector==='#grid'?grid:selector==='#filters'?filters:null,
    querySelectorAll:selector=>selector==='.mall-category-shortcuts [data-filter-target],.mall-primary-nav [data-filter-target]'?[...Object.values(links),...Object.values(headerLinks)]:[]
  };
  const requested=[];
  const sandbox={document:doc,window:{addEventListener(){}},
    MutationObserver:class{observe(){}},
    AbortSignal:{timeout:()=>({})},
    fetch:async(url,config)=>{
      requested.push({url,method:config.method,credentials:config.credentials});
      const cat=decodeURIComponent(url.split('category=')[1]||'');
      const value=responses[cat];
      if(value==='error')throw Error('offline');
      return {ok:true,json:async()=>({products:value||[]})};
    }
  };
  runInNewContext(script,sandbox,{timeout:2000});
  await tick();
  await tick();
  return {nodes,links,headerLinks,requested};
}

test('Toss underwriting filters hide all verified-empty categories without removing unrelated navigation',async()=>{
  const {nodes,links,headerLinks,requested}=await simulate();
  assert.equal(requested.length,4);
  assert.ok(requested.every(x=>x.method==='GET'&&x.credentials==='omit'));
  for(const cat of [...cats,'local']){
    assert.equal(nodes[cat].hidden,true,cat);
    if(links[cat])assert.equal(links[cat].hidden,true,cat+' shortcut');
    if(headerLinks[cat])assert.equal(headerLinks[cat].hidden,true,cat+' header navigation');
  }
  assert.equal(nodes.all.hidden,false);
});
test('a genuine live product keeps only its category visible',async()=>{
  const live={shareCode:'real',checkoutReady:true,product:{saleType:'direct'}};
  const {nodes}=await simulate({responses:{book:[live]}});
  assert.equal(nodes.book.hidden,false);
  assert.equal(nodes.general.hidden,true);
  assert.equal(nodes.local.hidden,false,'region shortcut may still have live items');
});
test('temporary public API errors do not falsely label categories empty',async()=>{
  const {nodes}=await simulate({responses:{book:'error'}});
  assert.equal(nodes.book.hidden,false);
});
test('deep linked empty category safely falls back to All filter',async()=>{
  const {nodes}=await simulate({selected:'book'});
  assert.equal(nodes.book.hidden,true);
  assert.ok(nodes.all.clicked>=1);
});
test('Mall build loads the guard and styles hidden categories without enabling checkout',()=>{
  assert.ok(template.includes('/assets/category-visibility.js'));
  assert.ok(template.includes('실제 판매 가능한 상품만 목록에 표시합니다.'));
  assert.ok(template.includes('자체 비회원 카드결제는 아직 활성화되지 않았습니다.'));
  assert.match(css,/#filters \[data-filter\]\[hidden\]/);
  assert.match(css,/\.mall-primary-nav \[data-filter-target\]\[hidden\]/);
  assert.doesNotMatch(script,/requestPayment\(|confirmPayment\(|TOSS_SECRET_KEY|method:\s*['"]POST['"]/);
});
