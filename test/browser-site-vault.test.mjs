import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePublicHttpsSite,planLocalSiteVaultIntent,redactSiteVaultReceipt} from '../browser-site-vault.js';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const policy=JSON.parse(read('config/browser-site-vault-policy.json'));
const script=read('tools/ekodi-device-agent/windows/ekodi-site-vault.ps1');

test('safe origin normalization supports arbitrary canonical HTTPS public sites',()=>{
  const korail=normalizePublicHttpsSite('https://www.korail.com/ticket/login');
  const same=normalizePublicHttpsSite('https://www.korail.com/another/path');
  assert.equal(korail.ok,true);
  assert.equal(korail.origin,'https://www.korail.com');
  assert.equal(korail.startUrl,'https://www.korail.com/ticket/login');
  assert.equal(korail.siteId,same.siteId,'one vault per exact origin');
  assert.notEqual(korail.siteId,normalizePublicHttpsSite('https://korail.com/').siteId);
  assert.equal(normalizePublicHttpsSite('https://www.example.co.kr/login').ok,true);
  assert.equal(normalizePublicHttpsSite('HTTPS://EXAMPLE.COM/').origin,'https://example.com');
  assert.equal(korail.siteId.length,64);
});

test('private, non-HTTPS, credential-bearing, fragment and port URLs are never enrolled',()=>{
  for(const value of [
    '', 'example.com','http://example.com/','ftp://example.com/',
    'https://user:password@example.com/','https://example.com/?token=secret',
    'https://example.com/#access_token=secret','https://127.0.0.1/',
    'https://192.168.0.1/','https://[::1]/','https://10.0.0.1/',
    'https://localhost/','https://portal.internal/','https://server.local/',
    'https://example.test/','https://example.com:8443/',
    'https://singlelabel/','https://example.com/ login','https://example.com/\n'
  ]){
    assert.equal(normalizePublicHttpsSite(value).ok,false,JSON.stringify(value));
  }
});
test('automation, cloud calls, secret extraction and payment cannot reuse the site vault',()=>{
  const base={action:'open',site:'https://www.korail.com/ticket/login'};
  const local={windowsInteractiveUser:true,localDpapiAvailable:true,userPresentConsent:true,nativeBrowserPasswordSaveConsent:true};
  assert.equal(planLocalSiteVaultIntent(base,{}).code,'SITE_VAULT_LOCAL_WINDOWS_USER_REQUIRED');
  assert.equal(planLocalSiteVaultIntent(base,{...local,userPresentConsent:false}).code,'SITE_VAULT_LOCAL_CONSENT_REQUIRED');
  for(const bad of [{automatic:true},{unattended:true},{source:'cloud'},{source:'mcp'},
    {readCredentials:true},{exportCookies:true},{injectPassword:true},{pay:true},{purchase:true},{mutateAccount:true}]){
    const outcome=planLocalSiteVaultIntent({...base,...bad},local);
    assert.equal(outcome.ok,false,JSON.stringify(bad));
  }
  const allowed=planLocalSiteVaultIntent(base,local);
  assert.equal(allowed.ok,true);
  assert.equal(allowed.secretExport,false);
  assert.equal(allowed.serverSync,false);
  assert.equal(allowed.credentialsRelay,false);
  assert.equal(allowed.automaticLoginInput,false);
  assert.equal(allowed.thirdPartyBrowserProfileReuse,false);
  assert.equal(planLocalSiteVaultIntent({action:'register',site:base.site,rememberPasswords:true},{...local,nativeBrowserPasswordSaveConsent:false}).code,'SITE_VAULT_PASSWORD_MANAGER_CONSENT_REQUIRED');
});
test('policy preserves existing ephemeral auth and local per-user password boundaries',()=>{
  assert.equal(policy.integration.existingInteractiveAuthUnaffected,true);
  assert.equal(policy.integration.credentialCopiesToCloud,false);
  assert.equal(policy.lifecycle.productionEnabled,false);
  assert.equal(policy.isolation.encryptedAtRest,'Windows DPAPI CurrentUser');
  assert.equal(policy.authority.aiOrMcpMayRetrieveCredentials,false);
  assert.equal(policy.authority.cloudCommandMayOpenVault,false);
  assert.equal(policy.authority.unattendedStartForbidden,true);
  assert.equal(policy.isolation.remoteDebuggingDisabled,true);
  assert.equal(policy.sensitiveMutations.financialPayment,'separate-human-gate');
  assert.equal(policy.integration.personalCredentialVault,'PERSONAL-CREDENTIAL-VAULT-001');
});
test('Windows implementation uses Windows CurrentUser DPAPI without cookie export or CDP',()=>{
  assert.match(script,/ProtectedData\]::Protect/);
  assert.match(script,/ProtectedData\]::Unprotect/);
  assert.match(script,/DataProtectionScope\]::CurrentUser/g);
  assert.match(script,/WindowsIdentity\]::GetCurrent\(\)\.IsSystem/);
  assert.match(script,/Environment\]::UserInteractive/);
  assert.match(script,/SITE_VAULT_LOCAL_CONSENT_DECLINED/);
  assert.match(script,/SITE_VAULT_ORIGIN_MISMATCH/);
  assert.match(script,/SITE_VAULT_ARCHIVE_PATH_FORBIDDEN/);
  assert.match(script,/SITE_VAULT_ARCHIVE_TOO_LARGE/);
  assert.match(script,/SITE_VAULT_ACTIVE_PROFILE_NOT_REMOVED/);
  assert.match(script,/--disable-sync/);
  assert.match(script,/--disable-extensions/);
  assert.match(script,/password_manager_enabled=\$PasswordManagerAllowed/);
  assert.doesNotMatch(script,/--remote-debugging-port|Network\.getCookies|Runtime\.evaluate|document\.cookie|Input\.dispatch|Set-Clipboard|Invoke-WebRequest|Invoke-RestMethod|SendKeys/);
});
test('receipts never echo account hints, password, cookies, or secret material',()=>{
  const projection=redactSiteVaultReceipt({
    action:'open',outcome:'allowed',site:'https://www.korail.com',username:'user@example.com',
    password:'secret',cookies:['session=123'],vaultCiphertext:'deadbeef',card:'1234',
  });
  assert.equal(projection.outcome,'allowed');
  assert.doesNotMatch(JSON.stringify(projection),/user@example.com|secret|session=123|deadbeef|1234|card/i);
});
