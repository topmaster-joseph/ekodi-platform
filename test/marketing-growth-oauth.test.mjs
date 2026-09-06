import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('EKODI central social connector exposes login-only YouTube OAuth and vault publishing', async () => {
  const [growth,publisher,ui,config] = await Promise.all([
    read('marketing-growth-worker.js'), read('marketing-publishing-worker.js'),
    read('marketing-ai-channel-manager.js'), read('wrangler.marketing-growth.toml'),
  ]);
  assert.match(growth,/startYouTubeOAuth/);
  assert.match(growth,/consumeYouTubeTicket/);
  assert.match(growth,/oauth\/youtube\/callback/);
  assert.match(growth,/GOOGLE_OAUTH_BROKER/);
  assert.match(growth,/host === 'ekodi\.kr'/);
  assert.match(growth,/MARKETING_OAUTH_VAULT_KEY/);
  assert.match(growth,/refreshYouTubeAccessToken/);
  assert.match(growth,/token_ciphertext/);
  assert.match(growth,/upload\/youtube\/v3\/videos\?uploadType=resumable/);
  assert.match(publisher,/\['facebook','instagram','threads','youtube'\]/);
  assert.match(ui,/data-connect="youtube"/);
  assert.match(ui,/Google로 YouTube 연결/);
  assert.match(ui,/Metricool은 필수가 아닙니다/);
  assert.match(config,/GOOGLE_CLIENT_ID/);
  assert.match(config,/binding = "GOOGLE_OAUTH_BROKER"/);
  assert.match(config,/service = "ekodi-storage-control"/);
  assert.match(config,/entrypoint = "GoogleOAuthBroker"/);
});
