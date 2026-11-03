import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const billing = await readFile(new URL('../author-billing-control.js', import.meta.url), 'utf8');
const auth = await readFile(new URL('../auth-site/author-auth.js', import.meta.url), 'utf8');
const fn = new Function(`${billing.match(/const AUTHOR_ORIGIN[^\n]*\n[^\n]*\n[^\n]*\n/)[0]}\n${billing.match(/function validReturnTo[\s\S]*?\n}\n/)[0]}\nreturn validReturnTo;`)();

test('author billing returns to the canonical apex path by default', () => {
  assert.equal(fn(''), 'https://ekodi.kr/author/#membership');
  assert.equal(fn('https://ekodi.kr/author/studio?tab=plan'), 'https://ekodi.kr/author/studio?tab=plan');
  assert.equal(fn('https://ekodi.kr/admin/'), 'https://ekodi.kr/author/#membership');
  assert.equal(fn('https://ekodi.kr/authority'), 'https://ekodi.kr/author/#membership');
  assert.equal(fn('http://ekodi.kr/author/'), 'https://ekodi.kr/author/#membership');
  assert.equal(fn('https://evil.example/author/'), 'https://ekodi.kr/author/#membership');
});

test('author sign-in defaults to the apex studio', () => {
  assert.match(auth, /const AUTHOR_HOME='https:\/\/ekodi\.kr\/author\/'/);
  assert.match(auth, /target\.pathname\.startsWith\('\/author\/'\)/);
});
