import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [app,menu,shared,minutes]=await Promise.all([
 read('sites/seonammedi/public/app.js'),
 read('sites/seonammedi/public/central-category-runtime.js'),
 read('sites/seonammedi/public/shared-site-header.css'),
 read('sites/seonammedi/public/minutes/minutes.css'),
]);
test('home-only artwork state follows all hash-based main menu subviews and restores on home',()=>{
 assert.match(app,/const key=viewAliases\[view\]\|\|''/);
 assert.match(app,/if\(hero\)hero\.hidden=Boolean\(key\)/);
 assert.match(app,/document\.body\.dataset\.seonammediImageMode=key\|\|categoryPanel&&!categoryPanel\.hidden\?'inner':'home'/);
});
test('opening any central menu hides homepage imagery before selecting a subcategory',()=>{
 assert.match(menu,/function syncImageMode\(\)/);
 assert.match(menu,/document\.body\.dataset\.seonammediImageMode=!panel\.hidden\|\|subview\?'inner':'home'/);
 assert.match(menu,/panel\.hidden=false;triggers\.forEach\([^\n]+syncImageMode\(\)/);
 assert.match(menu,/function close\(\)[^\n]+syncImageMode\(\)/);
});
test('image and embedded visual elements are absent across six menu routes and board pages',()=>{
 for(const item of [
  'body[data-seonammedi-image-mode="inner"] main > .hero',
  'body[data-seonammedi-image-mode="inner"] main > #homePublicFeed',
  'body[data-seonammedi-image-mode="inner"] main :is(img,picture,svg,canvas,video,iframe,object,embed)',
  'body.board-notices main :is(img,picture,svg,canvas,video,iframe,object,embed)',
  'body.board-voices main :is(img,picture,svg,canvas,video,iframe,object,embed)',
  'body.board-finance main :is(img,picture,svg,canvas,video,iframe,object,embed)',
  'background-image:none!important',
 ])assert.ok(shared.includes(item),item);
 assert.match(minutes,/main :is\(img,picture,svg,canvas,video,iframe,object,embed\)\{display:none!important\}/);
 assert.doesNotMatch(shared,/:root\s*\{/);
});
