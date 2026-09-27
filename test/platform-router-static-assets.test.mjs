import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_ROUTER_STATIC_ASSET_PATHS, routePlatformStaticAsset } from '../platform-router-static-assets.js';

test('platform static router exposes one unique declarative path list',()=>{
  assert.equal(new Set(PLATFORM_ROUTER_STATIC_ASSET_PATHS).size,PLATFORM_ROUTER_STATIC_ASSET_PATHS.length);
  for(const path of ['/store-admin.css','/jadam-admin.css','/workspace-admin.js','/cheonggye/local-region-admin-auth.js']){
    assert.ok(PLATFORM_ROUTER_STATIC_ASSET_PATHS.includes(path),path);
  }
});

test('platform static router returns the registered assets and ignores unknown paths',()=>{
  const css=routePlatformStaticAsset('/store-admin.css');
  const js=routePlatformStaticAsset('/workspace-admin.js');
  assert.equal(css instanceof Response,true);
  assert.equal(js instanceof Response,true);
  assert.equal(routePlatformStaticAsset('/not-a-platform-static-asset'),null);
});
