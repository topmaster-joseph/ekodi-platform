import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertSeonamMediAssetCachePolicy } from '../scripts/seonammedi-cache-contract.mjs';

const privateHeaders = new Headers({
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow, noarchive',
});
const immutableHeaders = new Headers({ 'cache-control':'public, max-age=31536000, immutable' });

test('administrator JavaScript and CSS MUST be uncached and unindexed', () => {
  for(const key of ['admin/admin.js','admin/admin.css']){
    assert.equal(assertSeonamMediAssetCachePolicy(key, privateHeaders), 'private');
    assert.throws(()=>assertSeonamMediAssetCachePolicy(key, immutableHeaders),/asset_cache_policy_/);
    assert.throws(()=>assertSeonamMediAssetCachePolicy(key,new Headers({'cache-control':'no-store'})),/asset_robots_policy_/);
  }
});
test('public hashed JS and CSS keep long-lived immutable cache expectations', () => {
  for(const key of ['app.js','app.css']){
    assert.equal(assertSeonamMediAssetCachePolicy(key,immutableHeaders), 'immutable');
    assert.throws(()=>assertSeonamMediAssetCachePolicy(key,privateHeaders),/asset_cache_policy_/);
  }
});
test('verification contract matches live routing security policy', () => {
  const verify = readFileSync(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8');
  const router = readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.ok(verify.includes('assertSeonamMediAssetCachePolicy(key,assetResult.response.headers)'));
  assert.ok(router.includes("out.headers.set('cache-control','no-store')"));
  assert.ok(router.includes("out.headers.set('x-robots-tag','noindex, nofollow, noarchive')"));
});
