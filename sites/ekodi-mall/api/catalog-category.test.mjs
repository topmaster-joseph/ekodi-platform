import test from 'node:test';
import assert from 'node:assert/strict';
import { curatedMallCategory } from './catalog-category.js';
import { productBodyFromItem } from './domeggook-import.js';

test('curation uses current Mall categories without any supplier-only public category', () => {
  assert.equal(curatedMallCategory('차량용 정리함'), 'living');
  assert.equal(curatedMallCategory('크리스마스 트리 장식'), 'gift');
  assert.equal(curatedMallCategory('포장박스', '선물 포장'), 'gift');
  assert.equal(curatedMallCategory('욕실 미끄럼 방지 매트', '욕실 매트'), 'living');
  assert.equal(curatedMallCategory('반려동물 장난감'), 'living');
});
test('catalog draft has non-committal preorder copy and no supplier name', () => {
  const item = { title:'연말 패키지', inventory:7, jejuExtra:0 };
  const draft = productBodyFromItem(item, 11900, '선물 포장');
  assert.equal(draft.product.category,'gift');
  assert.equal(draft.product.price,11900);
  assert.doesNotMatch(JSON.stringify(draft), /도매꾹|도매매|domeggook|구매 가능/);
  assert.match(draft.product.story,/판매 시작 후/);
});
