import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptMallPartnerCredential,
  encryptMallPartnerCredential,
  mallPartnerFingerprint,
  mallPartnerVaultReady,
} from '../mall-partner-vault.js';
import { handleMallPartnerRequest } from '../mall-partner-control.js';

test('Mall partner Vault encrypts credentials and decrypts only with the key', async () => {
  const env={MALL_PARTNER_CREDENTIAL_KEY:'test-only-credential-key'};
  assert.equal(mallPartnerVaultReady(env),true);
  const encrypted=await encryptMallPartnerCredential(env,'secret-token-value');
  assert.ok(encrypted.ciphertext);
  assert.ok(encrypted.iv);
  assert.equal(encrypted.ciphertext.includes('secret-token-value'),false);
  const value=await decryptMallPartnerCredential(env,{credential_ciphertext:encrypted.ciphertext,credential_iv:encrypted.iv});
  assert.equal(value,'secret-token-value');
});

test('Mall partner fingerprint is deterministic and public API fails closed without Core DB', async () => {
  const first=await mallPartnerFingerprint({id:'sample',feedUrl:'https://example.com/feed'});
  const second=await mallPartnerFingerprint({id:'sample',feedUrl:'https://example.com/feed'});
  assert.equal(first,second);
  const response=await handleMallPartnerRequest(new Request('https://api.ekodi.kr/api/mall/providers/search?q=gift'),{});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.code,'MALL_PROVIDER_DATABASE_UNAVAILABLE');
});