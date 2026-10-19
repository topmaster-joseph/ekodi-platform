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

test('known Google gates use the canonical registry',()=>{
  const board=readFileSync(new URL('services/independent-board/worker.js',root),'utf8');
  assert.match(board,/EKODI_IDENTITY_API\+'\/identities'/);
  assert.match(board,/x\?\.is_current===true/);
  const pastor=readFileSync(new URL('supabase/functions/church-pastor-api/index.ts',root),'utf8');
  assert.match(pastor,/login_identities/);
  assert.match(pastor,/provider:'eq\.google',status:'eq\.active'/);
});
