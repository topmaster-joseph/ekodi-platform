import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Community social registry preserves service channels and delegated auth',async()=>{
  const [html,css,social,runtime]=await Promise.all([
    read('community/index.html'),read('community/community-discovery.css'),read('community/social-links.js'),read('community/community-enhancements.js')
  ]);
  assert.match(html,/channel-social-slot/);
  assert.match(html,/data-ekodi-social-links/);
  for(const label of ['EKODI Church','Connect','EKODI Biz','EKODI Lab','EKODI Trade']) assert.match(html,new RegExp(label));
  assert.match(css,/channel-social-slot\{display:contents\}/);
  assert.match(social,/authHref/);
  assert.match(social,/authTarget/);
  assert.match(runtime,/closest/);
});