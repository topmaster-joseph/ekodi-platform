import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const governance = JSON.parse(fs.readFileSync('governance/amendments/2026-09-11-my-operator-hub-v2.json', 'utf8'));
const docs = fs.readFileSync('docs/architecture/my-operator-hub.md', 'utf8');

test('My EKODI is operator-personalized, not a mandatory ordinary-user destination', () => {
  assert.equal(governance.routing.operator_hub, 'https://ekodi.kr/my/');
  assert.equal(governance.routing.ordinary_user_flow, 'site-local');
  assert.equal(governance.routing.legacy_my_host, 'compatibility-only');
  assert.match(governance.principles.join('\n'), /not a mandatory destination for ordinary end users/i);
  assert.match(docs, /Ordinary users stay inside the brand context/i);
});

test('My EKODI cannot become an authorization source of truth', () => {
  assert.match(governance.principles.join('\n'), /does not grant, infer, or elevate privileges/i);
  assert.match(docs, /does not grant or elevate permissions/i);
});

test('shared identity is independent from exposing My EKODI', () => {
  assert.equal(governance.routing.identity_boundary, 'shared-ekodi-identity');
  assert.match(docs, /Identity and My EKODI are separate concepts/i);
});
