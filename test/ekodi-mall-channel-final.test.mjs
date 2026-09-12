import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('Mall channel console unifies connection policy AI allocation and job recovery', async()=>{
  const ui=await read('workspace-admin-page.js');
  assert.match(ui,/게시 · 홍보 채널 통합관리/);
  assert.match(ui,/channelPolicyForm/);
  assert.match(ui,/channelAiForm/);
  assert.match(ui,/data-channel-control/);
  assert.match(ui,/maxPostsPerDay/);
  assert.match(ui,/minHoursBetweenPosts/);
  assert.match(ui,/publishWindowStart/);
  assert.match(ui,/maxAttempts/);
  assert.match(ui,/data-job-action/);
  assert.match(ui,/유료 광고 집행은 자동 활성화하지 않습니다/);
});

test('publishing engine enforces channel controls before provider execution', async()=>{
  const worker=await read('marketing-publishing-worker.js');
  assert.match(worker,/CHANNEL_DAILY_LIMIT/);
  assert.match(worker,/CHANNEL_COOLDOWN/);
  assert.match(worker,/CHANNEL_TIME_WINDOW/);
  assert.match(worker,/publication_deferred/);
  assert.match(worker,/channelControlMatch/);
  assert.match(worker,/request.method === 'GET'\) return readPolicy/);
  assert.match(worker,/credentialMode==='oauth-vault'/);
});

test('Mall OAuth projection preserves explicit control while applying safe defaults', async()=>{
  const growth=await read('marketing-growth-worker.js');
  assert.match(growth,/mallSubject=subject\.type==='tenant'&&subject\.key==='ekodimall'/);
  assert.match(growth,/\['facebook','instagram','threads'\]\.includes\(provider\)/);
  assert.match(growth,/maxPostsPerDay:1/);
  assert.match(growth,/minHoursBetweenPosts:6/);
  assert.match(growth,/publishWindowStart:'08:00'/);
  assert.match(growth,/status='credentials_required'/);
  assert.doesNotMatch(growth,/UPDATE marketing_publish_channels SET status='disconnected'/);
});
