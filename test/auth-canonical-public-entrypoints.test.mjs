import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entrypoints = [
  'social/auth-state.js',
  'energy/auth-state.js',
  'books/publishing/studio/app.js',
  'bible/app.js',
  'education/app.js',
  'author/billing.js',
  'author/app.js',
  'community/connect/app.js',
  'customer-google-prereg.js',
  'marketing-funnel-admin.js',
  'marketing-ai-admin.js',
  'preview-public-projection.js',
];

test('EKODI site login entrypoints exclusively use canonical /auth/', () => {
  for (const file of entrypoints) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.ok(source.includes('https://ekodi.kr/auth/'), file + ': missing canonical auth URL');
    assert.doesNotMatch(source, /https?:\\/\\/auth\\.ekodi\\.kr\\b/i, file + ': legacy auth host is forbidden');
  }
});

test('marketing and author redirects return to canonical service paths', () => {
  const author = readFileSync(new URL('../author/app.js', import.meta.url), 'utf8');
  const marketing = readFileSync(new URL('../marketing-funnel-admin.js', import.meta.url), 'utf8');
  assert.ok(author.includes('return_to=https%3A%2F%2Fekodi.kr%2Fauthor%2F'));
  assert.ok(marketing.includes('return_to=https%3A%2F%2Fekodi.kr%2Fekodibiz%2Fmarketing-ai'));
});
