import test from 'node:test';
import assert from 'node:assert/strict';
import {churchLiveCss} from '../tenant-live-church-shell.js';

test('church live content is centered consistently across site regions',async()=>{
  const css=await churchLiveCss().text();
  for(const selector of ['.church-live-site-header','.live-shell','.live-intro','.church-live-site-footer-inner']){
    assert.ok(css.includes(selector),selector);
  }
  assert.match(css,/--church-live-content-width:1080px/);
  assert.match(css,/word-break:keep-all/);
  assert.match(css,/@media\(max-width:800px\)/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/data-church-live-inline="true"/);
});
