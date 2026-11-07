import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderTenantServiceAdmin} from '../tenant-service-admin-ui.js';

function node(tag){
  return {
    tag,children:[],dataset:{},attributes:{},textContent:'',className:'',
    append(...children){this.children.push(...children)},
    replaceChildren(...children){this.children=children},
    setAttribute(key,value){this.attributes[key]=value},
    addEventListener(name,callback){this.listeners??={};this.listeners[name]=callback},
    querySelector(key){return walk(this).find(x=>x.tag===key)||null},
    get lastChild(){return this.children.at(-1)},
  };
}
function walk(root){
  return [root,...(root.children||[]).flatMap(walk)];
}
const sample=[
  {key:'channels',category:'publishing',categoryLabel:'채널',label:'SNS',description:'채널관리',readiness:'ready',menuVisible:true,navSection:'publishing'},
  {key:'autopost',category:'publishing',categoryLabel:'채널',label:'자동게시',description:'자동게시',readiness:'ready',menuVisible:false,navSection:'publishing'},
  {key:'soon',category:'publishing',categoryLabel:'채널',label:'미출시',description:'준비중',readiness:'planned',menuVisible:false,navSection:null},
  {key:'accounting',category:'finance',categoryLabel:'재무',label:'회계',description:'회계',readiness:'ready',menuVisible:true,navSection:'finance'}
];
test('site service filter switches only rendered rows; no settings writes',()=>{
  const prev=globalThis.document;
  globalThis.document={createElement:node};
  try{
    const root=node('root');let toggles=0;
    renderTenantServiceAdmin(root,{siteKey:'ekodibiz',items:sample,onToggle:()=>{toggles++}});
    const nodes=()=>walk(root);
    const status=()=>nodes().filter(x=>x.className==='tenant-service-row').map(x=>x.children[1].dataset.serviceKey);
    assert.deepEqual(status(),['channels','autopost','soon']);
    const btn=name=>nodes().find(x=>x.dataset.serviceFilter===name);
    btn('unselected').listeners.click();
    assert.deepEqual(status(),['autopost']);
    assert.equal(btn('unselected').attributes['aria-pressed'],'true');
    btn('unready').listeners.click();
    assert.deepEqual(status(),['soon']);
    btn('selected').listeners.click();
    assert.deepEqual(status(),['channels']);
    const finance=nodes().find(x=>x.tag==='button'&&x.textContent==='재무');
    finance.listeners.click();
    assert.deepEqual(status(),['accounting']);
    btn('unready').listeners.click();
    assert.deepEqual(status(),[]);
    assert.ok(nodes().some(x=>x.className==='tenant-service-empty'));
    assert.equal(toggles,0);
    assert.equal(root.dataset.tenantServiceFilter,'unready');
    assert.equal(root.dataset.tenantServiceCategory,'finance');
    renderTenantServiceAdmin(root,{siteKey:'ekodibiz',items:sample,onToggle:()=>{toggles++}});
    assert.deepEqual(status(),[],'filter and category persist after server re-render');
    btn('all').listeners.click();
    assert.deepEqual(status(),['accounting']);
  }finally{
    if(prev===undefined)delete globalThis.document;
    else globalThis.document=prev;
  }
});

test('status filter is inside existing site settings only; no automatic service or capability expansion',()=>{
  const source=readFileSync(new URL('../tenant-service-admin-ui.js',import.meta.url),'utf8');
  assert.match(source,/data-service-filter-count/);
  assert.match(source,/activeFilter==='unready'/);
  assert.match(source,/root\.dataset\.tenantServiceFilter/);
  assert.match(source,/typeof onToggle!=='function'/);
  assert.doesNotMatch(source,/localStorage\.setItem\(['"]tenant_service/);
});
