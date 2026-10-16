import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// A passing count of 24 is insufficient if the middle duplicated navigation
// is merely present but visible after a header menu transition.
const source=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
test('first-party guest audit checks rendered middle-menu visibility for every homepage category',()=>{
  assert.match(source,/record\.middleMenuVisualChecks\?\?=\[\]/);
  assert.match(source,/getComputedStyle\(title\)\.display==='none'/);
  assert.match(source,/getComputedStyle\(buttons\)\.display==='none'/);
  assert.match(source,/duplicate_middle_menu_visible_/);
  for(const label of ['활동이력','관련소식','소통채널'])
    assert.ok(source.includes(label),'missing menu '+label);
});
test('hiding duplicate navigation must preserve safe visible social preview',()=>{
  assert.match(source,/socialPreviewVisible/);
  assert.match(source,/socialLinkSafe/);
  assert.match(source,/social_preview_regressed_when_middle_menu_hidden/);
  assert.match(source,/link\.protocol==='https:'/);
});
