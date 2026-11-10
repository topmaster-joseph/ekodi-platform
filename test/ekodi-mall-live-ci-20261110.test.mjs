import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderMallHeader} from '../mall-shared-header.js';

test('canonical live Mall home and subpages retain account/search/cart/navigation while showing store-specific CI',async()=>{
 for(const opts of [{home:true},{home:false,publicPrefix:'/ekodimall'}]){
  const html=renderMallHeader(opts);
  assert.match(html,/data-mall-ci="opposing-gates" aria-hidden="true"/);
  assert.match(html,/<svg width="25" height="25" viewBox="0 0 64 64"/);
  assert.match(html,/EKODI<small>MALL<\/small>/);
  assert.match(html,/mallGlobalSearch/);
  assert.match(html,/data-mall-account/);
  assert.match(html,/href="\/auth\/\?site=mall"/);
  assert.match(html,/mall-primary-nav/);
  assert.match(html,/판매하기/);
  assert.match(html,/전체상품/);
  assert.match(html,/쿠팡제휴몰/);
  assert.doesNotMatch(html,/EKODI®|상표등록 완료/);
 }
});
test('Mall generated production source uses this renderer, not unrelated historical mall.html',async()=>{
 const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
 const [builder,shared,css]=await Promise.all([
   read('sites/ekodi-mall/scripts/build.mjs'),read('mall-shared-header.js'),read('sites/ekodi-mall/assets/styles.css')
 ]);
 assert.match(builder,/import \{ renderMallHeader \} from '\.\.\/\.\.\/\.\.\/mall-shared-header\.js'/);
 assert.match(builder,/renderMallHeader\(/);
 assert.match(shared,/data-mall-ci="opposing-gates"/);
 assert.match(css,/\.mark\[data-mall-ci="opposing-gates"\] svg/);
});
