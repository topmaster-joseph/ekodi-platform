import test from 'node:test';
import assert from 'node:assert/strict';
import { seonammediRobotsTxt, SEONAMMEDI_DAUM_WEBMASTER_LINE } from '../seonammedi-domain-gateway.js';
test('SeonamMedi robots.txt carries the Daum webmaster ownership line and keeps crawl rules', () => {
  const robots = seonammediRobotsTxt();
  assert.equal(robots.split('\n')[0], SEONAMMEDI_DAUM_WEBMASTER_LINE);
  assert.match(SEONAMMEDI_DAUM_WEBMASTER_LINE, /^#DaumWebMasterTool:[a-f0-9]{64}:[A-Za-z0-9+/=]+$/);
  assert.match(robots, /User-agent: \*\nAllow: \//);
  assert.match(robots, /Sitemap: https:\/\/seonammedi\.kr\/sitemap\.xml/);
});
