import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../church-section-nav.js',import.meta.url),'utf8');
function harness(initial=''){
 const handlers={};
 const sectionNames=['hero','church-public-panels','church-live-entry','weekly-worship','about','worship','message','community','partner-news','online','location'];
 const createClassList=()=>{
   const set=new Set();
   return {
     add:x=>set.add(x),
     contains:x=>set.has(x),
     toggle:(x,enabled)=>{if(enabled)set.add(x);else set.delete(x)}
   };
 };
 const sections=sectionNames.map(id=>({
   id:id.includes('-')||!['hero','church-public-panels','church-live-entry'].includes(id)?id:'',
   classList:{...createClassList(),_name:id},
   matches:selector=>selector==='section',
   contains:target=>target?.within===id,
   scrollIntoView:()=>{}
 }));
 // The named home sections are classified by CSS class, not an element id.
 for(let i=0;i<3;i++){
   const original=sections[i].classList.contains;
   sections[i].classList.contains=name=>name===sectionNames[i]||original(name);
 }
 const main={children:sections,classList:createClassList(),prepend:node=>{main.subnav=node}};
 const node=tag=>({
   tag,className:'',hidden:false,children:[],attributes:{},
   setAttribute(k,v){this.attributes[k]=v},
   removeAttribute(k){delete this.attributes[k]},
   append(child){this.children.push(child)},
   replaceChildren(...children){this.children=children},
   scrollIntoView:()=>{}
 });
 const headers=['#worship','#together'].map(hash=>({...node('a'),hash}));
 const document={
   querySelector:query=>query==='body > main'?main:null,
   querySelectorAll:()=>headers,
   createElement:node,
   getElementById:key=>key==='giving'?{within:'online'}:null
 };
 const location={hash:initial};
 const window={
   addEventListener:(name,fn)=>{handlers[name]=fn},
   EKODIChurchI18n:{refresh(){}}
 };
 const body={dataset:{}};
 document.body=body;
 runInNewContext(source,{window,document,location,requestAnimationFrame:fn=>fn()});
 const active=()=>sections.filter(s=>s.classList.contains('church-section-active')).map(s=>s.classList._name);
 return {location,handlers,active,main,body,headers};
}

test('initial landing shows only welcome and previews; menu selects only its own section',()=>{
 const h=harness('');
 assert.deepEqual(h.active(),['hero','church-public-panels']);
 h.location.hash='#worship';h.handlers.hashchange();
 assert.deepEqual(h.active(),['worship']);
 assert.equal(h.main.subnav.children.length,3);
 h.location.hash='#weekly-worship';h.handlers.hashchange();
 assert.deepEqual(h.active(),['weekly-worship']);
 h.location.hash='#together';h.handlers.hashchange();
 assert.deepEqual(h.active(),['community']);
 assert.equal(h.main.subnav.children.length,6);
 h.location.hash='#partner-news';h.handlers.hashchange();
 assert.deepEqual(h.active(),['partner-news']);
 h.location.hash='#location';h.handlers.hashchange();
 assert.deepEqual(h.active(),['location']);
 h.location.hash='#online';h.handlers.hashchange();
 assert.deepEqual(h.active(),['online']);
 h.location.hash='';h.handlers.hashchange();
 assert.deepEqual(h.active(),['hero','church-public-panels']);
});
test('old nested deep links show their parent and malformed hashes fall back safely',()=>{
 const h=harness('#giving');
 assert.deepEqual(h.active(),['online']);
 h.location.hash='#%';
 assert.doesNotThrow(()=>h.handlers.hashchange());
 assert.deepEqual(h.active(),['hero','church-public-panels']);
});
