import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin-provider-control.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');

test('provider control covers Cloudflare GitHub and Supabase', () => {
  for (const marker of ['cloudflare','github','supabase','EKODIProviderControl']) assert.ok(source.includes(marker), marker);
});

test('provider hierarchy includes environment and secret boundary', () => {
  assert.match(source, /계정.*Zone \/ 도메인.*Worker.*환경.*Secret/s);
  assert.match(source, /계정 \/ 조직.*Repository.*Branch \/ Environment.*Actions Secret/s);
  assert.match(source, /조직.*Project.*Edge Function \/ DB.*Project Secret/s);
  assert.ok(source.includes("['production','staging','development']"));
});

test('production secret writes remain gated and values are not exposed by this control', () => {
  assert.ok(source.includes('Production 쓰기·교체·삭제는 Human Gate'));
  assert.equal(source.includes('secretValue'), false);
  assert.equal(source.includes('localStorage.setItem'), false);
});

test('build bundles provider control behind existing lazy AI Ops and Security assets', () => {
  assert.ok(build.includes("readFile(`${root}admin-provider-control.js`, 'utf8')"));
  assert.ok(build.includes('Unified provider control marker missing'));
  assert.ok(build.includes('${adminProviderControlJs}'));
});
