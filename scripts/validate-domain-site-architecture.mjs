import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const architecture = JSON.parse(await readFile(new URL('../config/domain-site-architecture.json', import.meta.url), 'utf8'));
const approved = JSON.parse(await readFile(new URL('../config/domain-site-principle.approved.json', import.meta.url), 'utf8'));

assert.equal(architecture.principleApprovalId, approved.approvalId, 'DOMAIN_ARCHITECTURE_PRINCIPLE_CHANGED: approval id mismatch. Ask the EKODI operator to re-confirm the principle before updating the approved snapshot.');
assert.deepEqual(architecture.principle, approved.approvedPrinciple, 'DOMAIN_ARCHITECTURE_PRINCIPLE_CHANGED: active principle differs from the approved snapshot. Stop deployment and request explicit re-confirmation.');

const allowed = new Set(architecture.principle.standaloneSubdomainCategories);
assert.ok(!allowed.has('professional_ai'), 'User-facing professional AI must not be a standalone subdomain category.');
assert.ok(allowed.has('gateway'), 'The technical AI Gateway category must remain available.');
for (const service of architecture.standaloneServices) {
  assert.ok(allowed.has(service.category), `Standalone subdomain category not allowed: ${service.id}:${service.category}`);
  const url = new URL(service.url);
  assert.ok(url.hostname === 'ekodi.kr' || url.hostname.endsWith('.ekodi.kr'), `Non-EKODI standalone URL: ${service.url}`);
  if (service.id === 'ai-gateway') {
    assert.equal(service.category, 'gateway');
    assert.equal(service.url, 'https://ai.ekodi.kr/');
  }
}

const aiIds = new Set();
for (const ai of architecture.professionalAis || []) {
  assert.match(ai.id, /^[a-z0-9][a-z0-9-]*$/);
  assert.ok(!aiIds.has(ai.id), `Duplicate professional AI id: ${ai.id}`);
  aiIds.add(ai.id);
  assert.equal(ai.canonicalUrl, `https://ekodi.kr/ai/${ai.id}/`, `Professional AI must use root AI path canonical: ${ai.id}`);
  const runtime = new URL(ai.runtimeUrl);
  assert.ok(runtime.hostname.endsWith('.ekodi.kr'), `Professional AI compatibility runtime must remain inside ekodi.kr: ${ai.runtimeUrl}`);
  assert.notEqual(ai.runtimeUrl, ai.canonicalUrl, `Professional AI runtime must not masquerade as canonical: ${ai.id}`);
  assert.equal(ai.runtimeStatus, 'compatibility-execution-alias', `Professional AI runtime status must be explicit: ${ai.id}`);
}
assert.ok(aiIds.has('marketing') && aiIds.has('creator') && aiIds.has('life') && aiIds.has('energy') && aiIds.has('support'), 'Expected first-wave professional AI services are missing.');

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
assert.equal(architecture.principle.professionalAiSubdomainCreation, false);
console.log(`✅ EKODI Domain & Site Architecture v${architecture.version} validated: ${architecture.spaces.length} spaces, ${architecture.professionalAis.length} professional AIs, principle ${architecture.principleApprovalId}`);
