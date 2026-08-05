import assert from 'node:assert/strict';
import test from 'node:test';
import { clampInteger, normalizeKey, normalizeText } from '../src/index.ts';

test('shared normalization is null-safe', () => {
  assert.equal(normalizeKey(' EKODI.KR '), 'ekodi.kr');
  assert.equal(normalizeKey(null), '');
  assert.equal(normalizeText('  EKODI  '), 'EKODI');
});

test('integer clamping handles bounds and fallbacks', () => {
  assert.equal(clampInteger(500, 7, 365, 60), 365);
  assert.equal(clampInteger('30.8', 7, 365, 60), 30);
  assert.equal(clampInteger('invalid', 7, 365, 60), 60);
});
