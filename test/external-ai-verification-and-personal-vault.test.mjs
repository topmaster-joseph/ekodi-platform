import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  generatePersonalVaultKey,
  wrapPersonalVaultKey,
  unwrapPersonalVaultKey,
  encryptPersonalVaultSecret,
  decryptPersonalVaultSecret,
  personalCredentialVaultReady,
  PERSONAL_CREDENTIAL_VAULT_CRYPTO,
} from '../personal-credential-vault.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('personal credential vault uses per-person envelope encryption and item AAD',async()=>{
  const env={PERSONAL_CREDENTIAL_VAULT_KEK:'test-only-kek',PERSONAL_CREDENTIAL_VAULT_KEK_VERSION:'7'};
  assert.equal(personalCredentialVaultReady(env),true);
  const dek=generatePersonalVaultKey();
  const wrapped=await wrapPersonalVaultKey(env,{ownerPersonId:'person-1',vaultId:'vault-1',dek});
  assert.notEqual(wrapped.wrappedKey,'');
  const unwrapped=await unwrapPersonalVaultKey(env,{ownerPersonId:'person-1',vaultId:'vault-1',...wrapped});
  assert.deepEqual([...unwrapped],[...dek]);
  const encrypted=await encryptPersonalVaultSecret(dek,{ownerPersonId:'person-1',vaultId:'vault-1',itemId:'item-1',kind:'password',value:'correct horse battery staple'});
  assert.notEqual(encrypted.ciphertext,'correct horse battery staple');
  assert.equal(await decryptPersonalVaultSecret(dek,{ownerPersonId:'person-1',vaultId:'vault-1',itemId:'item-1',kind:'password',...encrypted}),'correct horse battery staple');
  await assert.rejects(()=>decryptPersonalVaultSecret(dek,{ownerPersonId:'person-2',vaultId:'vault-1',itemId:'item-1',kind:'password',...encrypted}));
  assert.equal(PERSONAL_CREDENTIAL_VAULT_CRYPTO.oauthTokensStoredHere,false);
  assert.equal(PERSONAL_CREDENTIAL_VAULT_CRYPTO.passkeyPrivateKeysStoredHere,false);
});

test('vault policy keeps canonical My surface and forbids admin, AI and MCP plaintext reveal',async()=>{
  const policy=JSON.parse(await read('config/personal-credential-vault-policy.json'));
  assert.equal(policy.canonicalSurface,'https://ekodi.kr/my/security/vault');
  assert.equal(policy.productionActivationDefault,false);
  assert.equal(policy.ownership.centralAdminPlaintextAccess,false);
  assert.equal(policy.access.mcpSecretRevealExposure,false);
  assert.equal(policy.access.aiSecretRevealExposure,false);
  assert.equal(policy.access.externalAiSecretForwarding,false);
  assert.equal(policy.access.listNeverDecrypts,true);
});

test('vault schema stores ciphertext only and audits without secret bodies',async()=>{
  const migration=await read('migrations/0108_personal_credential_vault.sql');
  assert.match(migration,/wrapped_dek_ciphertext/);
  assert.match(migration,/secret_ciphertext/);
  assert.match(migration,/secret_aad/);
  assert.doesNotMatch(migration,/password\s+TEXT/i);
  assert.doesNotMatch(migration,/api_key\s+TEXT/i);
  assert.match(migration,/personal_credential_audit/);
});

test('external AI handoff is fail-closed behind EKODI governance and an auditable handoff gate',async()=>{
  const source=await read('admin-assist-dock.js');
  assert.match(source,/buildExternalAiHandoffPacket/);
  assert.match(source,/\/api\/control\/ai\/governance/);
  assert.match(source,/actionType:'external_ai\.handoff'/);
  assert.match(source,/verificationScope:'handoff-policy-only'/);
  assert.match(source,/EKODI 검증 게이트를 통과하지 못해 외부 AI로 전송하지 않았습니다/);
  assert.match(source,/current operational facts require separate fresh EKODI verification/);
  assert.match(source,/EKODI_MCP_URL='https:\/\/ekodi\.kr\/mcp'/);
});
