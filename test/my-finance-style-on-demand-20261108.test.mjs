import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../my/index.html',import.meta.url),'utf8');
const loader=readFileSync(new URL('../my/secondary-feature-loader.js',import.meta.url),'utf8');

function simulate(initialHash='#home'){
  // The optional modules are not under test; prevent their dynamic imports in
  // the tiny DOM harness while executing the actual finance-style wiring.
  const stripped=loader.replace(/const MODULES=Object.freeze\(\[[\s\S]*?\]\);/,
    'const MODULES=Object.freeze([]);')
    .replace(/const CLASSIC=Object.freeze\(\[[\s\S]*?\]\);/,
      'const CLASSIC=Object.freeze([]);')
    .replace('export function loadMySecondaryFeatures','function loadMySecondaryFeatures');
  const windowEvents=new Map(),documentEvents=new Map(),links=[];
  const session={signedIn:false};
  const location={hash:initialHash};
  const add=(map,name,handler)=>map.set(name,handler);
  class Element {
    constructor(finance=false){this.finance=finance}
    closest(selector){return this.finance&&selector.includes('[data-finance-open]')?this:null}
  }
  const document={
    readyState:'loading',
    head:{append(node){links.push(node)}},
    createElement(tag){assert.equal(tag,'link');return {dataset:{}}},
    querySelector(selector){
      if(selector==='link[data-my-finance-style]')return links.find(node=>node.dataset.myFinanceStyle)||null;
      return null;
    },
    addEventListener(name,fn){add(documentEvents,name,fn)},
  };
  const window={
    EKODI_MY_AUTH:{isSignedIn:()=>session.signedIn},
    addEventListener(name,fn){add(windowEvents,name,fn)},
    setTimeout(){},
  };
  runInNewContext(stripped,{document,window,location,Element,Promise});
  return {links,session,location,windowEvents,documentEvents,Element};
}

test('finance-only CSS is absent from render-blocking My EKODI HTML',()=>{
  assert.doesNotMatch(html,/<link[^>]+href="\/my\/personal-finance\.css/);
  assert.match(loader,/const FINANCE_STYLE='\/my\/personal-finance\.css\?v=/);
  assert.match(loader,/link\.rel='stylesheet'/);
  assert.match(loader,/link\.dataset\.myFinanceStyle='on-demand'/);
});

test('guest does not request finance styles, even when finance route is present',()=>{
  const ctx=simulate('#money');
  assert.equal(ctx.links.length,0);
  ctx.windowEvents.get('hashchange')();
  ctx.documentEvents.get('click')({target:new ctx.Element(true)});
  assert.equal(ctx.links.length,0);
  ctx.session.signedIn=true;
  ctx.windowEvents.get('ekodi:my-session')({detail:{signedIn:true}});
  assert.equal(ctx.links.length,1);
  assert.match(ctx.links[0].href,/^\/my\/personal-finance\.css\?v=/);
  ctx.windowEvents.get('hashchange')();
  assert.equal(ctx.links.length,1,'direct finance navigation never duplicates the CSS request');
});

test('authenticated finance click loads CSS on demand, other tabs do not',()=>{
  const ctx=simulate('#home');
  ctx.session.signedIn=true;
  ctx.windowEvents.get('ekodi:my-session')({detail:{signedIn:true}});
  assert.equal(ctx.links.length,0);
  ctx.documentEvents.get('click')({target:new ctx.Element(true)});
  assert.equal(ctx.links.length,1);
  ctx.documentEvents.get('click')({target:new ctx.Element(true)});
  assert.equal(ctx.links.length,1);
});
