import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../auth-site/client-auth.js', import.meta.url), 'utf8');

test('private client realms return to canonical workspace paths', () => {
  const expected = {
    cgma: 'https://ekodi.kr/cgma/client/',
    jadam: 'https://ekodi.kr/jadam/marketing',
    pizzamaru: 'https://ekodi.kr/pizzamaru/marketing',
    yogurt: 'https://ekodi.kr/yogurt/marketing',
  };
  for (const [slug, returnTo] of Object.entries(expected)) {
    assert.ok(auth.includes(`'${slug}-client':`));
    assert.ok(auth.includes(`returnTo:'${returnTo}'`));
  }
});

test('legacy tenant AI hosts remain compatibility origins, never default returns', () => {
  for (const slug of ['jadam','pizzamaru','yogurt']) {
    assert.ok(auth.includes(`https://${slug}.ai.ekodi.kr`));
    assert.ok(auth.includes(`https://${slug}.ekodi.kr`));
    assert.ok(!auth.includes(`returnTo:'https://${slug}.ai.ekodi.kr/`));
  }
});
