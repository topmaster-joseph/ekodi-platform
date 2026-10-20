import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareSeonamMediPublishedHtml} from '../scripts/seonammedi-release-html-alias.mjs';

test('customer-domain published photo shell can strip only its approved exact mount prefix',()=>{
  const expected='<script src="/seonammedi/board-central-category.js?v=20261015-photo-shell-1" defer></script>';
  const customer='<script src="/board-central-category.js?v=20261015-photo-shell-1" defer></script>';
  const allowed=['board-central-category.js'];
  const result=compareSeonamMediPublishedHtml(expected,customer,allowed);
  assert.equal(result.matched,true,JSON.stringify(result));
  assert.deepEqual(result.aliases,allowed);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer,[]).matched,false);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('photo-shell-1','photo-shell-2'),allowed).matched,false);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('board-central-category','untrusted-script'),allowed).matched,false);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('src="/','src="//'),allowed).matched,false,'protocol-relative script rewrite remains forbidden');
});

test('protected live-release verifier uses exact photo-shell path, not arbitrary alias patterns',async()=>{
  const verifier=await readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8');
  const alias=await readFile(new URL('../scripts/seonammedi-release-html-alias.mjs',import.meta.url),'utf8');
  const page=await readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
  assert.ok(verifier.includes("'board-central-category.js'"),'published photo shell must be included in strict alias list');
  assert.ok(verifier.includes('compareSeonamMediPublishedHtml(published,normalized.html,allowlisted)'),'strict byte-by-byte comparison must remain');
  assert.ok(alias.includes('unapproved_domain_alias'),'unregistered paths must fail closed');
  assert.ok(page.includes('/seonammedi/board/ui/central-category.js?v=20261016-home-photo-worker-1'),'actual published home must use the verified Worker route');
  assert.ok(verifier.includes("'board/ui/central-category.js'"),'published Worker path must be included in the strict alias list');
  assert.ok(!page.includes('src="/seonammedi/board-central-category.js'),'deprecated static script path must not reappear');
  assert.ok(!verifier.includes('allowAllPathAliases'),'no broad alias bypass');
});

// 2026-10-20: Shared Site Core run 39395436843 failed "Verify SeonamMedi live release convergence" because the
// shell assets moved to /seonammedi/central-category-* were not approved customer-domain aliases.
test('moved central-category shell assets are approved customer-domain aliases',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {compareSeonamMediPublishedHtml}=await import('../scripts/seonammedi-release-html-alias.mjs');
  const verifier=await readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8');
  for(const name of ['central-category-menu.css','central-category-runtime.js'])
    (await import('node:assert/strict')).default.ok(verifier.includes("'"+name+"'"),name+' must be allowlisted');
  const published='<link rel="stylesheet" href="/seonammedi/central-category-menu.css"><script src="/seonammedi/central-category-runtime.js?v=1" defer></script>';
  const live=published.replaceAll('="/seonammedi/','="/');
  const r=compareSeonamMediPublishedHtml(published,live,['central-category-menu.css','central-category-runtime.js']);
  (await import('node:assert/strict')).default.ok(r.matched,r.reason);
});
