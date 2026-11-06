import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {regionTabsClientScript,regionTabsScriptResponse} from '../region-tabs-ui.js';
import {localRegionBySlug} from '../local-region-registry.js';
import {localRegionPublicPage} from '../local-region-page.js';
import {regionalCommerceProgramById} from '../regional-commerce-program-registry.js';
import {regionalCommerceProgramPublicPage} from '../regional-commerce-program-page.js';

const region=localRegionBySlug('cheonggye');

function simulateTabs(html,prefix,initialHash=''){
  const buttons=[...html.matchAll(new RegExp('id="('+prefix+'-tab-[^"]+)" aria-controls="([^"]+)"','g'))];
  assert.equal(buttons.length,4,'expected four selectable information tabs');
  const panelById=new Map(buttons.map(([,id,panelId])=>[panelId,{hidden:false}]));
  const tabs=buttons.map(([,id,panelId])=>{
    const attrs={'aria-controls':panelId};
    return {id,attrs,handlers:{},tabIndex:0,focused:false,
      getAttribute(name){return this.attrs[name]},
      setAttribute(name,value){this.attrs[name]=value},
      addEventListener(name,fn){this.handlers[name]=fn},
      focus(){this.focused=true},
    };
  });
  const tablist={querySelectorAll(selector){assert.equal(selector,'[role="tab"]');return tabs}};
  const document={
    querySelectorAll(selector){assert.equal(selector,'[data-region-tablist]');return [tablist]},
    getElementById(id){return panelById.get(id)||null},
  };
  const window={
    location:{hash:initialHash},
    history:{replaceState(_state,_title,hash){window.location.hash=hash}},
    listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn},
  };
  assert.match(html,/<script src="\/cheonggye\/region-tabs-ui\.js" defer><\/script>/);
  runInNewContext(regionTabsClientScript(),{document,window});
  return {tabs,panelById,window};
}

test('Cheonggye exposes each registered public module and no dangling homepage anchors',async()=>{
  const html=await localRegionPublicPage(region).text();
  for(const module of region.modules){
    const href=module.id==='commerce-pass'?'/cgpass':module.publicPath;
    assert.ok(html.includes('href="'+href+'"'),href);
  }
  assert.ok(html.includes('href="/cgma"'));
  assert.ok(html.includes('href="/cheonggye/directory"'));
  assert.doesNotMatch(html,/href="#(?:proposal|commerce|events|jobs|neighborhood)"/);
  assert.doesNotMatch(html,/directory#campus/);
  assert.equal((html.match(/role="tabpanel"/g)||[]).length,4);
  assert.match(html,/max-width:680px/);
  assert.match(html,/max-width:390px/);
});

test('Cheonggye tabs activate requested deep link and support arrow-key navigation',async()=>{
  const html=await localRegionPublicPage(region).text();
  const {tabs,panelById,window}=simulateTabs(html,'region','#region-tab-shops');
  assert.equal(tabs[1].attrs['aria-selected'],'true');
  assert.equal(panelById.get('region-panel-life').hidden,true);
  assert.equal(panelById.get('region-panel-shops').hidden,false);
  let prevented=false;
  tabs[1].handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true}});
  assert.equal(prevented,true);
  assert.equal(tabs[2].attrs['aria-selected'],'true');
  assert.equal(tabs[2].focused,true);
  assert.equal(window.location.hash,'#region-tab-events');
  assert.equal(panelById.get('region-panel-shops').hidden,true);
  tabs[3].handlers.click();
  assert.equal(tabs[3].attrs['aria-selected'],'true');
  assert.equal(panelById.get('region-panel-connect').hidden,false);
});

test('CGPASS public tabs keep unlaunched benefits honest, and link to real regional pages',async()=>{
  const pass=regionalCommerceProgramById('cheonggye-pass');
  const html=await regionalCommerceProgramPublicPage(region,pass).text();
  for(const name of ['참여점포','쿠폰·할인','포인트·상품권','이용 안내'])assert.ok(html.includes(name));
  assert.match(html,/서비스 준비 중/);
  assert.match(html,/href="\/cheonggye\/commerce"/);
  assert.match(html,/href="\/cheonggye"/);
  assert.match(html,/href="\/cgma"/);
  assert.doesNotMatch(html,/\/cheonggye\/admin/);
  assert.doesNotMatch(html,/결제하기|포인트 사용하기|쿠폰 발급하기/);
  const {tabs,panelById}=simulateTabs(html,'pass','#pass-tab-guide');
  assert.equal(tabs[3].attrs['aria-selected'],'true');
  assert.equal(panelById.get('pass-panel-guide').hidden,false);
  assert.equal(panelById.get('pass-panel-stores').hidden,true);
});

test('regional tabs script is served as same-origin JavaScript for CSP compatibility',async()=>{
  const response=regionTabsScriptResponse();
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/javascript/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(await response.text(),/ArrowRight/);
});
