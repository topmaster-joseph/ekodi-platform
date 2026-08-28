import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const architecture = JSON.parse(await readFile(new URL('../config/domain-site-architecture.json', import.meta.url), 'utf8'));
const approved = JSON.parse(await readFile(new URL('../config/domain-site-principle.approved.json', import.meta.url), 'utf8'));

assert.equal(architecture.principleApprovalId, approved.approvalId, 'DOMAIN_ARCHITECTURE_PRINCIPLE_CHANGED: approval id mismatch. Ask the EKODI operator to re-confirm the principle before updating the approved snapshot.');
assert.deepEqual(architecture.principle, approved.approvedPrinciple, 'DOMAIN_ARCHITECTURE_PRINCIPLE_CHANGED: active principle differs from the approved snapshot. Stop deployment and request explicit re-confirmation.');

const allowed = new Set(architecture.principle.standaloneSubdomainCategories);
for (const service of architecture.standaloneServices) {
  assert.ok(allowed.has(service.category), `Standalone subdomain category not allowed: ${service.id}:${service.category}`);
  const url = new URL(service.url);
  assert.ok(url.hostname === 'ekodi.kr' || url.hostname.endsWith('.ekodi.kr'), `Non-EKODI standalone URL: ${service.url}`);
}

const seen = new Set();
for (const space of architecture.spaces) {
  assert.match(space.slug, /^[a-z0-9][a-z0-9-]*$/);
  assert.ok(!seen.has(space.slug), `Duplicate space slug: ${space.slug}`);
  seen.add(space.slug);
  assert.equal(space.canonicalUrl, `https://ekodi.kr/${space.slug}/`, `Space must use root path canonical: ${space.slug}`);
  for (const legacy of space.legacyUrls || []) {
    const legacyUrl = new URL(legacy);
    assert.ok(legacyUrl.hostname.endsWith('.ekodi.kr'), `Legacy alias must remain inside ekodi.kr: ${legacy}`);
    assert.notEqual(legacy, space.canonicalUrl, `Legacy alias duplicates canonical URL: ${space.slug}`);
  }
}

assert.equal(architecture.principle.tenantSubdomainCreation, false);
console.log(`✅ EKODI Domain & Site Architecture v${architecture.version} validated: ${architecture.spaces.length} spaces, principle ${architecture.principleApprovalId}`);
