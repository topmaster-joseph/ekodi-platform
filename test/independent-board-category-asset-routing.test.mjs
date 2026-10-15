import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const expected=await readFile(new URL('../sites/seonammedi/public/board-central-category.js',import.meta.url),'utf8');

test('independent board serves its own CSP-safe category script from both mounts',async()=>{
  for(const root of ['https://seonammedi.kr','https://ekodi.kr/seonammedi']){
    const asset=root+'/board/ui/central-category.js';
    const response=await board.fetch(new Request(asset),{});
    assert.equal(response.status,200,asset);
    assert.match(response.headers.get('content-type')||'',/application\\/javascript/);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(await response.text(),expected,'same source on both native mounts');
    for(const route of ['notices','voices']){
      const page=await board.fetch(new Request(root+'/board/'+route),{});
      assert.equal(page.status,200,root+'/'+route);
      const html=await page.text();
      const path=root.includes('ekodi.kr')?'/seonammedi/board/ui/central-category.js':'/board/ui/central-category.js';
      assert.ok(html.includes('src="'+path+'" defer'),'board page must reference Worker-owned script: '+root);
      assert.ok(!html.includes('src="/seonammedi/board-central-category.js"'),'old Site Core static-asset dependency must be removed');
      assert.ok(!html.includes('src="/board-central-category.js"'),'old custom-domain dependency must be removed');
    }
  }
});
