import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { linkedEmailGroup, accountAccess } from '../mail-control.js';

const env = { MAIL_LINKED_PERSON_EMAILS: 'topmaster.joseph@gmail.com, joseph@ekodi.kr ; a@x.kr' };

test('linked email groups match either login and ignore single-member groups', () => {
  assert.deepEqual(linkedEmailGroup(env, 'JOSEPH@ekodi.kr'), ['topmaster.joseph@gmail.com', 'joseph@ekodi.kr']);
  assert.deepEqual(linkedEmailGroup(env, 'topmaster.joseph@gmail.com').length, 2);
  assert.deepEqual(linkedEmailGroup(env, 'a@x.kr'), []);
  assert.deepEqual(linkedEmailGroup(env, 'stranger@gmail.com'), []);
  assert.deepEqual(linkedEmailGroup({}, 'joseph@ekodi.kr'), []);
});

function db(row) { return { prepare: () => ({ bind: () => ({ first: async () => row }) }) }; }

test('personal account opens for any linked person key and stays closed for others', async () => {
  const row = { id: 23, owner_type: 'person', owner_key: 'user-gmail' };
  const linked = { userId: 'user-ekodi', contexts: [], personKeys: ['user-ekodi', 'user-gmail'] };
  const other = { userId: 'user-x', contexts: [], personKeys: ['user-x'] };
  const legacy = { userId: 'user-gmail', contexts: [] };
  assert.equal((await accountAccess(db(row), linked, 23))?.permissions.read, true);
  assert.equal(await accountAccess(db(row), other, 23), null);
  assert.equal((await accountAccess(db(row), legacy, 23))?.permissions.manage, true);
});

test('linking requires a verified email and the admin page lists every personal account', async () => {
  const control = await readFile(new URL('../mail-control.js', import.meta.url), 'utf8');
  assert.match(control, /actor\.emailVerified\?linkedEmailGroup/);
  assert.match(control, /lower\(created_by_email\) IN/);
  const page = await readFile(new URL('../mail-admin-page.js', import.meta.url), 'utf8');
  assert.match(page, /a\.ownerType==='person'\|\|a\.ownerKey===current\.key/);
  const toml = await readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8');
  assert.match(toml, /MAIL_LINKED_PERSON_EMAILS = "topmaster\.joseph@gmail\.com,joseph@ekodi\.kr"/);
});
