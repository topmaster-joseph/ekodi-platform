import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicDiscoveryPath } from '../public-discovery-registry.js';

test('noindex parent is excluded without hiding its public live page', () => {
  assert.equal(isPublicDiscoveryPath('/mokdaehumun'), false);
  assert.equal(isPublicDiscoveryPath('/mokdaehumun/live'), true);
  assert.equal(isPublicDiscoveryPath('/seonammedi'), true);
});
