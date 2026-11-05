import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {churchOfficialCategoryRequiresManager} from '../site-board-control.js';

const source=readFileSync(new URL('../site-board-control.js',import.meta.url),'utf8');

test('only official Church announcement and schedule categories require board-manager publication',()=>{
  assert.equal(churchOfficialCategoryRequiresManager('ekodichurch','notice'),true);
  assert.equal(churchOfficialCategoryRequiresManager('ekodichurch','schedule'),true);
  for(const item of ['general','prayer','community','',null,'announcement'])assert.equal(churchOfficialCategoryRequiresManager('ekodichurch',item),false);
  for(const tenant of ['ekodimission','seonammedi','cgma'])assert.equal(churchOfficialCategoryRequiresManager(tenant,'notice'),false);
});
test('official Church post create, retag, edit, and delete are blocked for non-managers on the server',()=>{
  const denies=(source.match(/official_category_requires_board_manager/g)||[]).length;
  assert.equal(denies,3,'POST, existing PATCH/DELETE and category retag need three independent 403 denials');
  assert.match(source,/if\(churchOfficialCategoryRequiresManager\(route\.siteId,body\?\.categoryId\)&&!who\.manage\)/);
  assert.match(source,/if\(churchOfficialCategoryRequiresManager\(route\.siteId,tagged\?\.category_id\)\)/);
  assert.match(source,/const owns=clean\(existing\.author_person_id/);
  assert.match(source,/if\(!owns&&!who\.manage\)return boardJson\(instance,\{error:'forbidden'\},403\)/);
});
