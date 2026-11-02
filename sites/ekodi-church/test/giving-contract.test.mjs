import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('online giving keeps bank transfer available and uses verified MissionFund checkout', async () => {
  const html = await read('index.html');
  const runtime = await read('giving.js');
  const churchRuntime = await read('script.js');
  const config = await read('giving-config.json');
  assert.match(html, /id="giving"/);
  assert.match(html, /355-0088-5391-83/);
  assert.match(html, /782301-01-666597/);
  assert.match(html, /에코디교회 · 십일조·주일헌금/);
  assert.match(html, /에코디선교회 · 선교헌금/);
  assert.doesNotMatch(html, /에코디커뮤니티 · 선교헌금/);
  assert.doesNotMatch(churchRuntime, /replaceAll\('에코디선교회'/);
  assert.match(runtime, /go\.missionfund\.org/);
  assert.match(runtime, /hostname !== 'go\.missionfund\.org'/);
  assert.match(config, /"provider"\s*:\s*"missionfund"/);
  assert.match(config, /https:\/\/go\.missionfund\.org\/fmd01/);
  assert.match(config, /NICE Payments/);
  assert.match(config, /KFTC CMS/);
});
test('giving security policy does not load a payment SDK into the church origin', async () => {
  const headers = await read('_headers');
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /https:\/\/www\.youtube-nocookie\.com/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /object-src 'none'/);
  assert.doesNotMatch(headers, /tosspayments|toss\.im|unsafe-eval/i);
});

test('legacy direct-PG endpoints are absent from the public runtime contract', async () => {
  const runtime = await read('giving.js');
  const config = await read('giving-config.json');
  assert.doesNotMatch(runtime, /TossPayments|tosspayments|\/api\/giving\/(order|confirm)/i);
  assert.doesNotMatch(config, /TOSS_CLIENT_KEY|TOSS_SECRET_KEY/);
});
