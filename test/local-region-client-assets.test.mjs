import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { serializeBrowserClient } from '../browser-client-serializer.js';

const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');

test('browser serializer supplies the esbuild name helper to serialized client functions',()=>{
  function bundledLikeClient(){
    const probe=__name(()=>7,'probe');
    globalThis.__ekodiSerializerProbe=probe();
  }
  const script=serializeBrowserClient(bundledLikeClient);
  assert.match(script,/^const __name=/);
  assert.match(script,/__name\(/);
  new Function(script)();
  assert.equal(globalThis.__ekodiSerializerProbe,7);
  delete globalThis.__ekodiSerializerProbe;
});

test('all local-region browser assets use the helper-safe serializer',async()=>{
  const paths=[
    'local-region-admin-auth.js',
    'local-region-access-admin.js',
    'local-region-operations-admin.js',
    'local-region-forest-admin.js',
    'local-region-forest-public.js',
  ];
  for(const path of paths){
    const source=await read(path);
    assert.match(source,/import \{ serializeBrowserClient \} from '\.\/browser-client-serializer\.js';/,path);
    assert.match(source,/serializeBrowserClient\(clientMain\)/,path);
    assert.doesNotMatch(source,/clientMain\.toString\(\)/,path);
  }
});

test('shared-site release ownership covers every local-region browser asset and serializer',async()=>{
  const [deploy,stage,pkg]=await Promise.all([
    read('.github/workflows/deploy-site-core.yml'),
    read('.github/workflows/stage-shared-site-shell.yml'),
    read('package.json'),
  ]);
  const paths=[
    'local-region-admin-auth.js',
    'local-region-access-admin.js',
    'local-region-operations-admin.js',
    'local-region-forest-admin.js',
    'local-region-forest-public.js',
    'browser-client-serializer.js',
    'test/local-region-client-assets.test.mjs',
  ];
  for(const path of paths){
    assert.ok(deploy.includes("'"+path+"'"),'deploy ownership missing '+path);
    assert.ok(stage.includes("'"+path+"'"),'staging ownership missing '+path);
  }
  for(const path of [
    'local-region-admin-auth.js',
    'local-region-access-admin.js',
    'local-region-operations-admin.js',
    'local-region-forest-admin.js',
    'local-region-forest-public.js',
    'browser-client-serializer.js',
  ]){
    assert.ok(pkg.includes('node --check '+path),'static check missing '+path);
  }
});
