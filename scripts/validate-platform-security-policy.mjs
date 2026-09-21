import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const [policy,router,wrangler,pkgRaw,deploy]=await Promise.all([
  read('platform-security-policy.js'),
  read('platform-router-entry-worker.js'),
  read('wrangler.site.toml'),
  read('package.json'),
  read('.github/workflows/deploy-site-core.yml'),
]);

for(const marker of [
  'PLATFORM_SENSITIVE_RATE_LIMITER',
  'PLATFORM_PUBLIC_WRITE_RATE_LIMITER',
  'PLATFORM_METHOD_BLOCKED',
  'PLATFORM_QUERY_TOO_LARGE',
  'PLATFORM_BODY_TOO_LARGE',
  'PLATFORM_SECURITY_UNAVAILABLE',
  'PLATFORM_SENSITIVE_RATE_LIMITED',
  'PLATFORM_PUBLIC_WRITE_RATE_LIMITED',
  'X-EKODI-Security-Policy',
  'Strict-Transport-Security',
]) assert(policy.includes(marker),`platform security policy missing: ${marker}`);

assert(router.includes("from './platform-security-policy.js'"),'canonical router must import platform security policy');
assert(router.includes('await enforcePlatformRequestSecurity(request,env)'),'canonical router must enforce request security before dispatch');
assert(router.includes('applyPlatformSecurityHeaders(response,request)'),'canonical router must secure every returned response');

for(const marker of [
  'name = "PLATFORM_SENSITIVE_RATE_LIMITER"',
  'name = "PLATFORM_PUBLIC_WRITE_RATE_LIMITER"',
  'namespace_id = "3902"',
  'namespace_id = "3903"',
]) assert(wrangler.includes(marker),`shared site limiter binding missing: ${marker}`);

const pkg=JSON.parse(pkgRaw);
assert(String(pkg.scripts?.['validate:security']||'').includes('validate-platform-security-policy.mjs'),'validate:security must include the platform-wide policy validator');
assert(String(pkg.scripts?.check||'').includes('platform-security-policy.js'),'npm check must parse the platform security module');
assert(deploy.includes('platform-security-policy.js'),'shared-site production workflow must validate the platform security module');
assert(deploy.includes('validate-platform-security-policy.mjs'),'shared-site production workflow must validate the security contract');

console.log('Platform security policy valid: canonical edge enforcement, split mutation throttling, fail-closed sensitive paths, hardened response headers and production workflow enforcement are active.');

function assert(condition,message){
  if(!condition){
    console.error(`Platform security policy validation failed: ${message}`);
    process.exit(1);
  }
}
