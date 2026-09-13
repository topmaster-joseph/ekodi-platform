import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config=JSON.parse(await readFile(new URL('../config/realtime-sfu-provisioning.json',import.meta.url),'utf8'));

test('realtime SFU production provisioning is fail-closed',()=>{
  assert.equal(config.provider,'cloudflare-realtime');
  assert.equal(config.productionWorker,'ekodi-auth-api');
  assert.equal(config.firstTenant,'ekodichurch');
  assert.equal(config.failClosed,true);
  assert.equal(config.preserveExistingCredentials,true);
  assert.equal(config.directSessionProbeBeforeSecretWrite,true);
  assert.equal(config.productionHealthVerificationRequired,true);
  assert.equal(config.credentialValuesMayBeLogged,false);
});
