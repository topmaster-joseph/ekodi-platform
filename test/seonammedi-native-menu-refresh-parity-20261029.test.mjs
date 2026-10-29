import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../sites/seonammedi/public/central-category-runtime.js',import.meta.url),'utf8');
const html=await readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
const labels=['활동이력','관련소식','소통채널'];
const hashes=['#committee-activity','#timeline','#channels'];

test('native homepage owns all three menu views, including direct hash loads',()=>{
  for(const id of ['committeeActivityFilters','timelineFilters','publicChannelTabs']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  for(const label of labels)assert.ok(html.includes('>'+label+'</a>'));
  for(const hash of hashes)assert.ok(html.includes('href="'+hash+'"'));
  for(const line of [
    "document.querySelector('.site-header nav')?.addEventListener('click'",
    "window.addEventListener('popstate',syncViewFromLocation)",
    "window.addEventListener('hashchange',syncViewFromLocation)",
    "syncViewFromLocation();",
    "if(raw==='channels'||raw.startsWith('channels/'))",
    "if(raw==='committee-activity'||raw.startsWith('committee-activity/'))",
    "if(raw==='timeline'||raw.startsWith('timeline/'))"
  ])assert.ok(app.includes(line),line);
});

test('native load and subsequent refresh do not register competing legacy click handlers',()=>{
  for(const hash of hashes){
    const listeners=[],nativeIds=new Set(['committeeActivityFilters','timelineFilters','publicChannelTabs']);
    const legacyPanel={hidden:false};
    const nodes={'central-category-panel':legacyPanel};
    const body={dataset:{seonammediCentralTopic:'channels'}};
    const document={body,
      getElementById(id){return nativeIds.has(id)?{}:nodes[id]||null},
      querySelectorAll(){throw Error('native runtime must not attach links')},
      addEventListener(){throw Error('native runtime must not attach a second handler')}
    };
    runInNewContext(source,{document,location:{hash},window:{addEventListener(){listeners.push('unexpected')} }});
    assert.equal(legacyPanel.hidden,true,'legacy panel must be closed for '+hash);
    assert.equal(body.dataset.seonammediCentralTopic,'','legacy CSS must not hide native view for '+hash);
    assert.equal(listeners.length,0,'native view click handler belongs to app.js for '+hash);
  }
});

test('cache-busted runtime keeps both public mount routes on the same native code',()=>{
  assert.match(html,/\/seonammedi\/central-category-runtime\.js\?v=20261029-native-view-parity-1/);
  assert.match(html,/<script src="\/seonammedi\/app\.js\?v=/);
  assert.match(source,/const legacyPanel=document\.getElementById\('central-category-panel'\)/);
  assert.match(source,/document\.body\.dataset\.seonammediCentralTopic=''/);
});
