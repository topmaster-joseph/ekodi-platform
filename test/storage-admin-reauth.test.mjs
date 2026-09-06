import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../storage-admin.js', import.meta.url), 'utf8');

test('storage status reauth stays inside Admin until the administrator explicitly reconnects', async () => {
  const module = await source();

  assert.match(module, /error\.code=data\.code\|\|''/);
  assert.match(module, /error\.reconnectRole=data\.reconnectRole\|\|'primary'/);
  assert.match(module, /GOOGLE_REAUTH_REQUIRED/);
  assert.match(module, /Google Drive 다시 연결/);
  assert.match(module, /=>startOAuth\(error\.reconnectRole\|\|'primary'\)/);

  assert.doesNotMatch(module, /return new Promise\(\(\)=>\{\}\)/);
  assert.doesNotMatch(module, /data\.code==='GOOGLE_REAUTH_REQUIRED'[\s\S]{0,300}startOAuth/);
});
