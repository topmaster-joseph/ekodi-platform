import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/verify-business-links.yml', 'utf8');

test('Business OS gate verifies the canonical dynamic auth handoff', () => {
  assert.ok(workflow.includes("const AUTH_FALLBACK='https://auth.ekodi.kr/'"));
  assert.ok(workflow.includes("target.searchParams.set('site','business')"));
  assert.ok(workflow.includes("target.searchParams.set('return_to',canonicalBusinessUrl())"));
  assert.ok(!workflow.includes("const AUTH_FALLBACK='https://auth.ekodi.kr/?site=business&return_to=https%3A%2F%2Fbusiness.ekodi.kr%2F'"));
});

test('Business OS gate retains live auth and downstream route checks', () => {
  for (const value of [
    'https://business.ekodi.kr/',
    'https://auth.ekodi.kr/?site=business&return_to=https%3A%2F%2Fbusiness.ekodi.kr%2F',
    'https://ekodi.kr/ekodibiz',
    'https://ekodi.kr/ekodibiz/marketing-ai',
    'https://work.ekodi.kr/',
    'https://ekodi.kr/jadam/marketing',
  ]) assert.ok(workflow.includes(value), `missing ${value}`);
});
