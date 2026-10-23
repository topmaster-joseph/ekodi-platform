// EKODI-MALL-AUTH-CANONICAL-001: 판매자·운영 화면 로그인은 ekodi.kr/auth/ 로만 보낸다.
// auth.ekodi.kr·mall.ekodi.kr 같은 서브도메인은 DNS가 없어 로그인이 끊긴다(2026-10-23 운영 장애).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const roots = ['assets', 'src', 'content'];
const forbidden = /https?:\/\/(auth|mall)\.ekodi\.kr/i;

test('mall pages never link to legacy auth/mall subdomains', () => {
  const offenders = [];
  for (const dir of roots) {
    for (const name of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
      if (!/\.(js|html|json)$/.test(name)) continue;
      const text = readFileSync(new URL(`../${dir}/${name}`, import.meta.url), 'utf8');
      if (forbidden.test(text)) offenders.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('seller and ops logins use the canonical ekodi.kr/auth/ entry and return to the current page', () => {
  for (const name of ['seller.js', 'verification-ops.js', 'supplier-ops.js', 'sourcing-lab.js', 'fulfillment-lab.js', 'supplier-discovery.js', 'supplier-connectors.js']) {
    const text = readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8');
    assert.match(text, /https:\/\/ekodi\.kr\/auth\//, name);
    assert.match(text, /site['"]?\s*[,=]\s*['"]?mall-seller|site=mall-seller/, name);
    assert.match(text, /return_to/, name);
  }
});
