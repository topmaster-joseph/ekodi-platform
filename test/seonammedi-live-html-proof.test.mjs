import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {expectedSeonamMediHtmlAtOrigin,normalizeSeonamMediLiveHtml} from '../scripts/seonammedi-live-html-proof.mjs';
import {compareSeonamMediPublishedHtml} from '../scripts/seonammedi-release-html-alias.mjs';

const canonical='https://ekodi.kr/seonammedi';
const customer='https://seonammedi.kr';
const source='<!doctype html><html><head><meta name="twitter:card" content="summary_large_image">\n  <meta property="og:image" content="https://seonammedi.kr/seonammedi/assets/hero.png"></head><body><a href="/seonammedi/hero.png"><img src="/seonammedi/img.png"></a>\n</body></html>';
const adminExtension='<link rel="stylesheet" href="/site-publication-admin.css" data-ekodi-site-publication-admin-style><script src="/site-publication-admin.js" defer data-ekodi-site-publication-admin data-site-id="seonammedi"></script>';
const beacon='<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v4bc70e2c01a94c73b74392e4234840661791215815920" integrity="sha512-L0ha0OXavK/8okipN9F8BtP84dg9DUhPERbBXzwI6dgTA55d2+yweo3pn5CSFYs45/r8md2+xvUPtTdvTNRfjA==" data-cf-beacon=\'{"version":"2024.11.0","token":"3a717d2e21e7479bac38f567ef8831ad","r":1,"spa":2}\' crossorigin="anonymous"></script>';

test('custom-domain projection rewrites only HTML asset src/href, never social metadata',()=>{
  const local=expectedSeonamMediHtmlAtOrigin(source,customer);
  assert.match(local,/href="\/hero.png"/);
  assert.match(local,/src="\/img.png"/);
  assert.match(local,/content="https:\/\/seonammedi.kr\/seonammedi\/assets\/hero.png"/);
  assert.equal(expectedSeonamMediHtmlAtOrigin(source,canonical),source);
  assert.throws(()=>expectedSeonamMediHtmlAtOrigin(source,'https://unknown.example'),/unexpected_seonammedi_html_verification_origin/);
});

test('canonical and customer homepage HTML are byte identical after allowlisted projections',()=>{
  for(const origin of [canonical,customer]){
    const expected=expectedSeonamMediHtmlAtOrigin(source,origin);
    const normal=normalizeSeonamMediLiveHtml(expected,{origin,page:'index.html'});
    assert.equal(normal.html,expected);
    const withBeacon=expected.replace('\n</body>', '\n'+beacon+'\n</body>');
    const normalized=normalizeSeonamMediLiveHtml(withBeacon,{origin,page:'index.html'});
    assert.equal(normalized.beacons,1);
    assert.equal(normalized.html,expected);
    // The repair must not disguise a regression of a literal backslash-n in head.
    assert.notEqual(normalizeSeonamMediLiveHtml(expected.replace('summary_large_image">\n','summary_large_image">\\n'),{origin,page:'index.html'}).html,expected);
  }
});

test('finance admin links stay byte-identical and tenant-local on both public mounts',async()=>{
  const finance=await readFile(new URL('../sites/seonammedi/public/finance/index.html',import.meta.url),'utf8');
  assert.equal((finance.match(/href="\.\.\/admin\/\?panel=finance"/g)||[]).length,2);
  assert.doesNotMatch(finance,/href="https:\/\/ekodi\.kr\/seonammedi\/admin\/\?panel=finance"/);
  for(const origin of [canonical,customer]){
    const projected=expectedSeonamMediHtmlAtOrigin(finance,origin);
    assert.equal((projected.match(/href="\.\.\/admin\/\?panel=finance"/g)||[]).length,2,'gateway must preserve both tenant-local finance links');
    assert.equal(normalizeSeonamMediLiveHtml(projected,{origin,page:'finance/index.html'}).html,projected,'normalizer must not hide HTML changes');
    const exact=compareSeonamMediPublishedHtml(finance,projected,['shared-site-header.css']);
    assert.equal(exact.matched,true,'finance must differ solely by the audited shared header mount alias: '+exact.reason);
    const url=new URL('../admin/?panel=finance',origin+'/finance/');
    assert.equal(url.href,origin+'/admin/?panel=finance');
  }
});

test('admin HTML normalizer accepts only the EKODI-owned publication module injector',()=>{
  const original='<html><head><title>Admin</title></head><body>Admin</body></html>';
  const injected=original.replace('</head>',adminExtension+'</head>');
  assert.equal(normalizeSeonamMediLiveHtml(injected,{origin:canonical,page:'admin/index.html'}).html,original);
  assert.throws(()=>normalizeSeonamMediLiveHtml(original,{origin:canonical,page:'admin/index.html'}),/publication_extension_contract_mismatch/);
  assert.throws(()=>normalizeSeonamMediLiveHtml(injected+adminExtension,{origin:canonical,page:'admin/index.html'}),/publication_extension_contract_mismatch/);
  assert.throws(()=>normalizeSeonamMediLiveHtml(injected,{origin:canonical,page:'index.html'}),/unexpected_site_publication_injection/);
});

test('unrecognized beacons and malformed trusted metadata are not silently stripped',()=>{
  const malicious=source.replace('\n</body>','\n'+beacon.replace('static.cloudflareinsights.com','evil.example')+'\n</body>');
  assert.notEqual(normalizeSeonamMediLiveHtml(malicious,{origin:canonical,page:'index.html'}).html,source);
  const malformed=source.replace('\n</body>','\n'+beacon.replace('"token":"3a717d2e21e7479bac38f567ef8831ad"','"token":"oops"')+'\n</body>');
  assert.throws(()=>normalizeSeonamMediLiveHtml(malformed,{origin:canonical,page:'index.html'}),/untrusted_cloudflare_beacon_metadata/);
  assert.throws(()=>normalizeSeonamMediLiveHtml(source,{origin:canonical,page:'other.html'}),/unexpected_seonammedi_html_verification_page/);
});

test('production release convergence requires private finance, not the retired public ledger API',async()=>{
  const verifier=await readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8');
  const finance=await readFile(new URL('../sites/seonammedi/public/finance/index.html',import.meta.url),'utf8');
  assert.ok(verifier.includes('finance_private_surface_notice_missing'));
  assert.ok(verifier.includes('finance_private_admin_handoff_missing'));
  assert.ok(verifier.includes('finance_private_ledger_exposure_detected'));
  assert.ok(!verifier.includes('finance_surface_contract_missing'),'retired public API must not block release');
  assert.ok(finance.includes('공개 회계 조회는 제공하지 않습니다.'));
  assert.equal(finance.split('href="../admin/?panel=finance"').length-1,2);
  assert.ok(finance.includes('href="../board/notices">공지</a>'),'Notice must still open the public board directly from finance fallback');
  for(const secret of ['/api/seonammedi/admin/finance','id="ledger"','id="raised"','id="spent"'])assert.ok(!finance.includes(secret),'no finance payload in public HTML: '+secret);
  assert.ok(verifier.includes('notices_surface_contract_missing'),'notice contract must remain enforced');
});

test('production release verifier retains exact generated HTML byte provenance checks',async()=>{
  const script=await readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8');
  assert.match(script,/publishedHtmlHashes/);
  assert.match(script,/published_artifact_digest_mismatch/);
  assert.match(script,/compareSeonamMediPublishedHtml/);
  assert.match(script,/normalizeSeonamMediLiveHtml/);
  assert.match(script,/html_digest_mismatch/);
  assert.match(script,/live_homepage_head_literal_escaped_whitespace/);
});
