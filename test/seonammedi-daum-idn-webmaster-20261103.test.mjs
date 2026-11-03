import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {
  seonammediRobotsTxt,
  SEONAMMEDI_DAUM_WEBMASTER_LINE,
  SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE,
} from '../seonammedi-domain-gateway.js';

const IDN = 'xn--3e0b8b58jw4co4mnpll3k.kr';

test('IDN Daum ownership line is well-formed and distinct from the English line', () => {
  assert.match(SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE, /^#DaumWebMasterTool:[a-f0-9]{64}:[A-Za-z0-9+/=]+$/);
  assert.notEqual(SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE, SEONAMMEDI_DAUM_WEBMASTER_LINE);
});

test('each host serves only its own Daum line, crawl rules unchanged', async () => {
  for (const [host, line, other] of [
    [IDN, SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE, SEONAMMEDI_DAUM_WEBMASTER_LINE],
    ['seonammedi.kr', SEONAMMEDI_DAUM_WEBMASTER_LINE, SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE],
  ]) {
    const response = await worker.fetch(new Request(`https://${host}/robots.txt`));
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body.split('\n')[0], line);
    assert.ok(!body.includes(other));
    assert.match(body, /User-agent: \*\nAllow: \//);
    assert.match(body, /Sitemap: https:\/\/xn--3e0b8b58jw4co4mnpll3k\.kr\/sitemap\.xml/);
    assert.equal(body, seonammediRobotsTxt(host));
  }
});

test('HEAD robots.txt on the IDN host stays side-effect free', async () => {
  const response = await worker.fetch(new Request(`https://${IDN}/robots.txt`, { method: 'HEAD' }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});
