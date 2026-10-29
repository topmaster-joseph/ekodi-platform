import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,js,api]=await Promise.all([
  read('control.html'),read('control.js'),read('ai-command-control.js')
]);
test('canonical EKODI Control exposes a GitHub operations view',()=>{
  for(const value of ['data-view="github"','data-view-panel="github"','id="githubOperationsRefresh"',
    'id="githubOperationsSummary"','id="githubOperationsCards"'])
    assert.ok(html.includes(value),value);
});
test('GitHub observability is manual refresh and does not create a polling storm',()=>{
  assert.match(js,/function refreshGitHubOperations\(\)/);
  assert.ok(js.includes("if(view==='github')void refreshGitHubOperations()"));
  assert.ok(js.includes("api('/api/control/ai/v8/github?limit=30')"));
  assert.ok(js.includes('실측 미연결'));
  assert.doesNotMatch(js,/setInterval\(refreshGitHubOperations/);
});
test('auth and release boundaries remain server side',()=>{
  assert.match(api,/githubOperationsSnapshot/);
  assert.match(api,/requirePlatformSuperAdmin\('ai:read'\)/);
  assert.ok(html.includes('관측 전용입니다'));
  assert.doesNotMatch(js,/api\.github\.com|GITHUB_TOKEN|EKODI_GITHUB_WEBHOOK_SECRET/);
});
