import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../ekodibiz/site.js',import.meta.url),'utf8');
const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const injector=readFileSync(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../ekodi-service-manifest.js',import.meta.url),'utf8');

function siteHarness(){
  const events=new Map();
  const el={hidden:false,href:'',setAttribute(){},textContent:''};
  let locale='en';
  let selector=null;
  const root={lang:'ko-KR',dataset:{},setAttribute(){}};
  const context=createContext({
    document:{
      cookie:'ekodi_locale=en',
      documentElement:root,
      title:'EKODIBIZ',
      querySelector(q){return q==='[data-ekodi-language-placement="header"] select'?selector:el;},
      querySelectorAll(){return[];}
    },
    window:{
      EKODIUserLanguage:{getLocale:()=>locale},
      addEventListener(name,fn){events.set(name,fn);},
      dispatchEvent(){}
    },
    navigator:{language:'en-US'},
    localStorage:{getItem(){return 'en';},setItem(){throw Error('unwanted locale persistence')}},
    location:{hash:'',hostname:'ekodi.kr'},
    requestAnimationFrame(fn){fn();},
    queueMicrotask(){},
    MutationObserver:class{observe(){}},
    CustomEvent:class{constructor(name,{detail}){this.type=name;this.detail=detail;}}
  });
  runInContext(source,context,{timeout:3000});
  return {
    documentLocale:()=>root.lang,
    storedLocale:()=>runInContext('locale',context),
    offer(locales){selector={options:locales.map(value=>({value}))};},
    change(next){locale=next;events.get('ekodi:locale-change')?.({detail:{locale:next,source:'shared-user-shell'}});},
    sync(){runInContext('syncPublishedShellLocale()',context);}
  };
}

test('LANG-UI-001: EKODIBIZ ignores saved/browser English before publication readiness',()=>{
  const site=siteHarness();
  assert.equal(site.storedLocale(),'ko-KR');
  assert.equal(site.documentLocale(),'ko-KR');
  site.change('en');
  assert.equal(site.documentLocale(),'ko-KR');
});

test('LANG-UI-001: only options in a verified shared Shell header may localize EKODIBIZ',()=>{
  const site=siteHarness();
  site.offer(['ko-KR','en']);
  site.change('en');
  assert.equal(site.documentLocale(),'en');
  site.change('zh-CN');
  assert.equal(site.documentLocale(),'en','unpublished Chinese must be ignored');
  site.change('ko-KR');
  assert.equal(site.documentLocale(),'ko-KR');
});

test('LANG-UI-001: saved shared choice is restored only when a canonical published selector is ready',()=>{
  const site=siteHarness();
  site.change('en');
  site.sync();
  assert.equal(site.storedLocale(),'ko-KR');
  site.offer(['ko-KR','en']);
  site.sync();
  assert.equal(site.storedLocale(),'en');
});

test('shared-proxy Biz uses one existing header and footer with no duplicate chrome',()=>{
  const relevant=router.slice(router.indexOf('async function routeEkodiBizPublic('),router.indexOf('async function routeEkodiBizApi('));
  assert.match(manifest,/id:'biz'[^\n]*shellIntegration:'shared-proxy'/);
  assert.match(relevant,/injectEkodiShell\(rewritten,'biz','public',\{existingHeader:true,existingFooter:true,contextKind:'public'\}\)/);
  assert.match(relevant,/injectEkodiTenantReadability\(adopted,\{operatingSpace:false\}\)/);
  assert.match(injector,/options\?\.existingFooter===true/);
  assert.match(injector,/!this\.existingFooter/);
  assert.match(injector,/options\?\.existingHeader!==true/);
  assert.match(source,/document\.querySelector\('\[data-ekodi-language-placement="header"\] select'\)/);
});
