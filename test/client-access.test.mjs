import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, css, build] = await Promise.all([
  readFile(new URL('../client-access.js', import.meta.url), 'utf8'),
  readFile(new URL('../client-access.css', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('Control Center ships customer access assets only in the admin build', () => {
  assert.match(build, /'client-access\.css'/);
  assert.match(build, /'client-access\.js'/);
  assert.match(build, /asset === 'control-center\.html'/);
  assert.match(build, /client-access\.js/);
  assert.match(build, /client-access\.css/);
});

test('customer access UI uses only authenticated customer-admin endpoints', () => {
  assert.match(source, /\/api\/customers\/tenants/);
  assert.match(source, /\/users/);
  assert.match(source, /\/pre-register/);
  assert.match(source, /authorization/);
  assert.match(source, /ekodi-auth-token/);
  assert.doesNotMatch(source, /\/api\/customer\/(signup|register|login|accept-invite)/);
});

test('customer onboarding is Google preregistration without invite URLs or local secrets', () => {
  assert.match(source, /Google 고객 사전등록/);
  assert.match(source, /pre_registered/);
  assert.doesNotMatch(source, /invite\.inviteUrl/);
  assert.doesNotMatch(source, /\/invites/);
  assert.doesNotMatch(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /Math\.random/);
});

test('API-provided customer values render through textContent, not HTML injection', () => {
  assert.match(source, /node\.textContent = value/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
});

test('Clients navigation and responsive layout are part of the module', () => {
  assert.match(source, /data-section|dataset\.section/);
  assert.match(source, /'clients'/);
  assert.match(css, /\.client-access-layout/);
  assert.match(css, /@media\(max-width:900px\)/);
});
