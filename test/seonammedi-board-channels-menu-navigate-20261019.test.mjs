import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import board from '../services/independent-board/worker.js';

// Owner report (2026-10-19 02:11): on 시민의견, clicking 소통채널 stacked a
// "소통채널" block on top of the board, duplicating the centre content. Every top
// menu on a board must navigate to its home view instead of overlaying the board.

const source=await readFile(new URL('../sites/seonammedi/public/board-central-category.js',import.meta.url),'utf8');
const overlay=source.slice(0,source.indexOf('// Shared, image-free navigation layout'));

test('board pages link 소통채널 to the home channels view on both mounts',async()=>{
  for(const [base,home] of [['https://seonammedi.kr',''],['https://ekodi.kr/seonammedi','/seonammedi']])
    for(const route of ['voices','notices']){
      const html=await (await board.fetch(new Request(base+'/board/'+route),{})).text();
      const link=html.match(/<a href="([^"]+)"[^>]*data-category-menu="소통채널"[^>]*>소통채널<\/a>/);
      assert.ok(link,base+route+': 소통채널 link');
      assert.equal(link[1],home+'/#channels');
    }
});

test('the board script never intercepts the click or opens an overlay panel',()=>{
  assert.doesNotMatch(overlay,/preventDefault/);
  assert.doesNotMatch(overlay,/panel\.hidden\s*=\s*(false|alreadyOpen)/);
  const panel={hidden:false};let listeners=0;
  const trigger={setAttribute(){},addEventListener(){listeners++}};
  vm.runInNewContext(overlay,{document:{getElementById:id=>id==='central-category-panel'?panel:null,querySelectorAll:()=>[trigger]}});
  assert.equal(panel.hidden,true,'overlay stays hidden');
  assert.equal(listeners,0,'no click interception; the browser follows the link');
});
