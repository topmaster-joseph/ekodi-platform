import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicSpace, publicSpacePage } from '../space-entry-page.js';

test('known non-core spaces resolve under ekodi.kr paths',()=>{
  for(const slug of ['church','biz','lab','jadam','pizzamaru','yogurt','cgma']){
    const space=resolvePublicSpace(`/${slug}/`);
    assert.ok(space,slug);
    assert.equal(space.slug,slug);
  }
  assert.equal(resolvePublicSpace('/admin/'),null);
  assert.equal(resolvePublicSpace('/api/'),null);
});

test('public space page carries canonical root path and does not expose private data',async()=>{
  const space=resolvePublicSpace('/jadam/');
  const response=publicSpacePage(space);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'public-space');
  const html=await response.text();
  assert.match(html,/https:\/\/ekodi\.kr\/jadam\//);
  assert.match(html,/https:\/\/my\.ekodi\.kr\/jadam\//);
  assert.match(html,/https:\/\/marketing\.ekodi\.kr\/jadam\//);
  assert.doesNotMatch(html,/api[_-]?key|access[_-]?token|workspaceKey/i);
});
