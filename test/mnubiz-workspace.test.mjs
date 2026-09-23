import test from 'node:test';
import assert from 'node:assert/strict';
import { isMnuBizWorkspaceSlug, renderMnuBizPublicPage } from '../mnubiz-public-page.js';

test('mnubiz has a public alumni workspace surface', async()=>{
  assert.equal(isMnuBizWorkspaceSlug('mnubiz'),true);
  const response=renderMnuBizPublicPage();
  const html=await response.text();
  for(const token of ['국립목포대학교 경영동문회','/mnubiz/community','/mnubiz/admin','Community 엔진 연결']) assert.match(html,new RegExp(token));
  assert.equal(response.headers.get('x-ekodi-workspace'),'mnubiz');
});
