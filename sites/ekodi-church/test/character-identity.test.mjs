import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('church selects the approved founder-pastor EKODIAN profile explicitly', async () => {
  const html = await read('index.html');
  const runtime = await read('church-character-identity.js');
  assert.match(html, /data-ekodi-character-context="church"/);
  assert.match(html, /data-ekodi-character-identity="founder-pastor"/);
  assert.match(html, /church-character-identity\.js/);
  assert.match(runtime, /ekodi\.ekodian-identity\.v1/);
  assert.match(runtime, /id:'founder-pastor'/);
  assert.match(runtime, /subjectAuthorized:true/);
  assert.match(runtime, /EKODIUserCharacter\?\.setIdentity/);
});

test('church identity bridge carries no portrait or biometric payload', async () => {
  const runtime = await read('church-character-identity.js');
  assert.doesNotMatch(runtime, /portraitUrl|face_embedding|biometric|data:image/i);
});
