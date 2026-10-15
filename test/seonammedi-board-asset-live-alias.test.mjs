import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareSeonamMediPublishedHtml} from '../scripts/seonammedi-release-html-alias.mjs';

test('customer-domain published photo shell can strip only its approved exact mount prefix',()=>{
  const expected='<script src="/seonammedi/board/ui/central-category.js" defer></script>';
  const customer='<script src="/board/ui/central-category.js" defer></script>';
  const allowed=['board/ui/central-category.js'];
  const result=compareSeonamMediPublishedHtml(expected,customer,allowed);
  assert.equal(result.matched,true,JSON.stringify(result));
  assert.deepEqual(result.aliases,allowed);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer,[]).matched,false);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('central-category.js','changed-category.js'),allowed).matched,false);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('central-category.js','untrusted-script.js'),allowed).matched,false);
  assert.equal(compareSeonamMediPublishedHtml(expected,customer.replace('src="/','src="//'),allowed).matched,false,'protocol-relative script rewrite remains forbidden');
});

test('protected live-release verifier uses exact photo-shell path, not arbitrary alias patterns',async()=>{
  const verifier=await readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8');
  const alias=await readFile(new URL('../scripts/seonammedi-release-html-alias.mjs',import.meta.url),'utf8');
  const page=await readFile(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
  assert.ok(verifier.includes("'board/ui/central-category.js'"),'published photo shell must be included in strict alias list');
  assert.ok(verifier.includes('compareSeonamMediPublishedHtml(published,normalized.html,allowlisted)'),'strict byte-by-byte comparison must remain');
  assert.ok(alias.includes('unapproved_domain_alias'),'unregistered paths must fail closed');
  assert.ok(page.includes('/seonammedi/board/ui/central-category.js'),'actual published page must use the registered path');
  assert.ok(!verifier.includes('allowAllPathAliases'),'no broad alias bypass');
});
