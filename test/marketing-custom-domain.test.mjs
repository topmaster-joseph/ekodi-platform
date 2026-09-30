import test from 'node:test';
import assert from 'node:assert/strict';
import { isProOrAbove, normalizeCustomerHostname } from '../marketing-domain-control.js';

test('customer-owned hostname accepts subdomains and normalizes safe input', () => {
  assert.equal(normalizeCustomerHostname(' AI.Example.com. '), 'ai.example.com');
  assert.equal(normalizeCustomerHostname('marketing.shop.co.kr'), 'marketing.shop.co.kr');
});

test('customer-owned hostname rejects apex-like, wildcard, URL and EKODI/provider namespaces', () => {
  assert.equal(normalizeCustomerHostname('example.com'), '');
  assert.equal(normalizeCustomerHostname('*.example.com'), '');
  assert.equal(normalizeCustomerHostname('https://ai.example.com/path'), '');
  assert.equal(normalizeCustomerHostname('shop.ai.ekodi.kr'), '');
  assert.equal(normalizeCustomerHostname('foo.pages.dev'), '');
  assert.equal(normalizeCustomerHostname('foo.workers.dev'), '');
});

test('custom domain entitlement begins at Pro and includes higher Marketing AI plans', () => {
  assert.equal(isProOrAbove('free', 'free'), false);
  assert.equal(isProOrAbove('flex', 'active'), false);
  assert.equal(isProOrAbove('plus', 'active'), false);
  assert.equal(isProOrAbove('pro', 'active'), true);
  assert.equal(isProOrAbove('auto', 'active'), true);
  assert.equal(isProOrAbove('enterprise', 'active'), true);
  assert.equal(isProOrAbove('pro', 'past_due'), false);
  assert.equal(isProOrAbove('pro', 'canceled'), false);
});
