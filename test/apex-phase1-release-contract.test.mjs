import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [clientAuth, communityWorkflow, sharedManifest, mobileAudit] = await Promise.all([
  read('auth-site/client-auth.js'),
  read('.github/workflows/deploy-community.yml'),
  read('deploy/manifests/shared-site.worker.json'),
  read('scripts/verify-mobile-fixed-headers-live.mjs'),
]);

test('Community auth returns to the apex path and reads the apex Shell manifest', () => {
  assert.match(clientAuth, /community:\{name:'Community',returnTo:'https:\/\/ekodi\.kr\/community\/'/);
  assert.match(clientAuth, /https:\/\/ekodi\.kr\/shell\/manifest\.json/);
  assert.doesNotMatch(clientAuth, /returnTo:'https:\/\/community\.ekodi\.kr\/'/);
});

test('release verification uses canonical apex Shell and Auth paths', () => {
  assert.match(communityWorkflow, /https:\/\/ekodi\.kr\/shell\/health/);
  assert.match(communityWorkflow, /https:\/\/ekodi\.kr\/auth\/client-auth\.js/);
  assert.match(communityWorkflow, /returnTo:'https:\/\/ekodi\.kr\/community\/'/);
  assert.doesNotMatch(sharedManifest, /https:\/\/shell\.ekodi\.kr\/shell\.js/);
  assert.match(sharedManifest, /https:\/\/ekodi\.kr\/shell\/shell\.js/);
});

test('mobile production audit no longer depends on the retired Shell host', () => {
  assert.match(mobileAudit, /https:\/\/ekodi\.kr\/shell\/shell\.js/);
  assert.match(mobileAudit, /https:\/\/ekodi\.kr\/shell\/manifest\.json/);
  assert.doesNotMatch(mobileAudit, /https:\/\/shell\.ekodi\.kr\/(?:shell\.js|manifest\.json)/);
});
