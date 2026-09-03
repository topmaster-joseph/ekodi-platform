import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('EKODI central social connector exposes login-only YouTube OAuth and vault publishing', async () => {
  const [growth,publisher,ui,config] = await Promise.all([
    read('marketing-growth-worker.js'), read('marketing-publishing-worker.js'),
    read('marketing-ai-channel-manager.js'), read('wrangler.marketing-growth.toml'),
  ]);
  assert.match(growth,/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(growth,/youtube\.upload https:\/\/www\.googleapis\.com\/auth\/youtube\.readonly/);
  assert.match(growth,/oauth\/youtube\/callback/);
  assert.match(growth,/GOOGLE_CLIENT_SECRET/);
  assert.match(growth,/token_ciphertext/);
  assert.match(growth,/upload\/youtube\/v3\/videos\?uploadType=resumable/);
  assert.match(publisher,/\['facebook','instagram','threads','youtube'\]/);
  assert.match(ui,/data-connect="youtube"/);
  assert.match(ui,/Google로 YouTube 연결/);
  assert.match(ui,/Metricool은 필수가 아닙니다/);
  assert.match(config,/GOOGLE_CLIENT_ID/);
});
