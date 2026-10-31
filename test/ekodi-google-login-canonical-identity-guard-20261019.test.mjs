import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// EKODI verifies Google ID tokens in identity-api and then issues a Supabase
// email one-time session. Supabase therefore never records provider "google"
// (production 2026-10-18: 0 of 10 users). Any gate that decides "is this a
// Google login" from Supabase provider metadata alone rejects every real user.
// The canonical proof is EKODI's login_identities registry (directly, or via
// identity-api /identities). This guard keeps every such gate on that proof.

const root=new URL('../',import.meta.url);
const tracked=execFileSync('git',['ls-files','*.js','*.mjs','*.ts'],{cwd:root,encoding:'utf8'})
  .split('\n').filter(f=>f&&!f.startsWith('test/')&&!f.includes('node_modules/'));

const supabaseProviderGate=/app_metadata[\s\S]{0,240}['"]google['"]|identities[\s\S]{0,120}provider[\s\S]{0,80}['"]google['"]/;
const canonicalProof=/login_identities|identity-api['"`]?\s*\+?\s*['"`]?\/identities|EKODI_IDENTITY_API\+'\/identities'/;

test('no Google login gate relies on Supabase provider metadata without the EKODI identity registry',()=>{
  const offenders=[];
  for(const file of tracked){
    let source='';try{source=readFileSync(new URL(file,root),'utf8')}catch{continue}
    if(!supabaseProviderGate.test(source))continue;
    if(!canonicalProof.test(source))offenders.push(file);
  }
  assert.deepEqual(offenders,[],'Google gates must also accept EKODI login_identities proof: '+offenders.join(', '));
});

test('known gates use the canonical EKODI account registry (any linked login path)',()=>{
  const board=readFileSync(new URL('services/independent-board/worker.js',root),'utf8');
  assert.match(board,/EKODI_IDENTITY_API\+'\/identities'/);
  assert.match(board,/x\?\.is_current===true/);
  const pastor=readFileSync(new URL('supabase/functions/church-pastor-api/index.ts',root),'utf8');
  assert.match(pastor,/rpc\('ekodi_account_for_auth_user'/);
  assert.match(pastor,/verified_emails/);
  assert.doesNotMatch(pastor,/provider:'eq\.google'/);
  const access=readFileSync(new URL('supabase/functions/access-api/index.ts',root),'utf8');
  assert.match(access,/rpc\("ekodi_account_for_auth_user"/);
  // Tenant/site gates stay provider-agnostic: any explicitly linked login of the
  // same EKODI Person keeps that Person's tenant role.
  const tenantGate=access.slice(access.indexOf('async function tenantReviewerAuthorization'));
  assert.doesNotMatch(tenantGate.slice(0,tenantGate.indexOf('\n}\n')+3),/\.eq\("provider","google"\)/);
  // Platform root admin is the single deliberate exception (policy 2026-10-31):
  // it additionally requires a verified Google identity on the same Person, read
  // from the EKODI login_identities registry, never from Supabase provider metadata.
  const googleFilters=access.match(/\.eq\("provider","google"\)/g)||[];
  assert.equal(googleFilters.length,1,'provider=google filter allowed only in verifiedGoogleAdminEmails');
  const helper=access.match(/async function verifiedGoogleAdminEmails\([^\n]+\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(helper,/from\("login_identities"\)[\s\S]*\.eq\("provider","google"\)/);
});
