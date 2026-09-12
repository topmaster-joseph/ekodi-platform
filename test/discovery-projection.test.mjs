import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const policy = JSON.parse(fs.readFileSync(new URL('../config/discovery-projection-policy.json', import.meta.url), 'utf8'));

test('search and answer retrieval remain distinct from training', () => {
  assert.equal(policy.botIntent['search-index'], 'allow-public-projection');
  assert.equal(policy.botIntent['answer-retrieval'], 'allow-public-projection');
  assert.equal(policy.botIntent.training, 'deny');
});

test('private operational surfaces are non-indexable by default', () => {
  for (const key of ['authenticated', 'member', 'admin', 'api']) {
    assert.equal(policy.routeDefaults[key], 'noindex-nofollow-noarchive');
  }
  for (const key of ['raw', 'export', 'download']) {
    assert.equal(policy.routeDefaults[key], 'deny-discovery');
  }
});

test('robots is advisory and edge identity must be verified', () => {
  assert.equal(policy.security.robotsIsSecurityBoundary, false);
  assert.equal(policy.crawlerPolicy.verifiedIdentityRequiredAtEdge, true);
  assert.equal(policy.crawlerPolicy.trustUserAgentAlone, false);
});

test('structured data cannot widen the public projection', () => {
  assert.equal(policy.structuredData.source, 'public-discovery-projection-only');
  assert.equal(policy.structuredData.allowHiddenPrivateFacts, false);
});
