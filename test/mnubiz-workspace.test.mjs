import test from 'node:test';
import assert from 'node:assert/strict';
import { isMnuBizWorkspaceSlug, renderMnuBizPublicPage, mnubizPublicCss } from '../mnubiz-public-page.js';

test('mnubiz public surface follows CSP-safe user-site UI contract', async()=>{
  assert.equal(isMnuBizWorkspaceSlug('mnubiz'),true);
  const response=renderMnuBizPublicPage();
  const html=await response.text();
  for(const token of [
    '국립목포대학교 경영동문회',
    '/mnubiz/assets/site.css',
    'data-ekodi-user-ai-entry="off"',
    'site-header mnubiz-header',
    'data-ekodi-header-home',
    'data-ekodi-header-actions',
    'data-ekodi-site-subject="mnubiz"',
    'mnubiz-character-zone',
    'site.css?v=20260925-1'
  ]) assert.ok(html.includes(token), 'missing token: '+token);
  assert.doesNotMatch(html,/<style[\s>]/i);
  assert.doesNotMatch(html,/<footer[\s>]/i);
  assert.doesNotMatch(html,/\/mnubiz\/admin/);
  assert.doesNotMatch(html,/\/mnubiz\/community/);
  assert.doesNotMatch(html,/>Community</);
  assert.doesNotMatch(html,/운영공간/);
  assert.doesNotMatch(html,/Workspace/);
  assert.equal(response.headers.get('x-ekodi-workspace'),'mnubiz');

  const cssResponse=mnubizPublicCss();
  const css=await cssResponse.text();
  assert.match(css,/\.mnubiz-hero/);
  assert.match(css,/color-scheme:only light/);
  assert.match(css,/html\[data-ekodi-site-subject="mnubiz"\]\[data-ekodi-user-ui\]/);
  assert.match(css,/background:#f7f3ea!important/);
  assert.match(css,/@media\(prefers-color-scheme:dark\)/);
  assert.match(css,/\.mnubiz-character-zone/);
  assert.match(css,/--ekodi-user-footer-background/);
  assert.match(css,/\.mnubiz-grid/);
  assert.match(css,/body>main\.mnubiz-main\{width:100%!important/);
  assert.match(css,/\.ekodi-user-ui-footer\{margin-top:0!important/);
  assert.match(css,/@media\(max-width:860px\)/);
  assert.match(css,/word-break:keep-all/);
  assert.equal(cssResponse.headers.get('content-type'),'text/css; charset=utf-8');
});
