import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, createContext } from 'node:vm';
import { localRegionAdminAuthScript } from '../local-region-admin-auth.js';
import { cheonggyePassVendorIntakeScript } from '../cheonggyepass-vendor-intake-ui.js';
import { localRegionAccessAdminScript } from '../local-region-access-admin.js';
import { localRegionModuleAdminScript } from '../local-region-module-admin.js';
import { localRegionOperationsAdminScript } from '../local-region-operations-admin.js';
import { localRegionForestAdminScript } from '../local-region-forest-admin.js';
import { localRegionForestPublicScript } from '../local-region-forest-public.js';
import { localRegionModulePublicScript } from '../local-region-module-public.js';

const scripts=[
  ['admin authentication',localRegionAdminAuthScript],
  ['cheonggye pass vendor intake',cheonggyePassVendorIntakeScript],
  ['regional access administration',localRegionAccessAdminScript],
  ['regional module administration',localRegionModuleAdminScript],
  ['regional operations administration',localRegionOperationsAdminScript],
  ['regional forest administration',localRegionForestAdminScript],
  ['regional forest public',localRegionForestPublicScript],
  ['regional module public',localRegionModulePublicScript],
];
const prelude='(()=>{const __name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});\n';

test('all eight first-party regional standalone scripts supply a private esbuild __name helper',async()=>{
  for(const [label,makeResponse] of scripts){
    const response=makeResponse();
    assert.equal(response.status,200,label);
    assert.match(response.headers.get('content-type')||'',/^text\/javascript/,label);
    assert.equal(response.headers.get('cache-control'),'no-store',label);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff',label);
    const js=await response.text();
    assert.ok(js.startsWith(prelude),label+' lacks private helper prelude');
    assert.ok(js.endsWith('();})();'),label+' must close its own isolated IIFE');
    assert.doesNotThrow(()=>new Script(js),label+' invalid classic JavaScript syntax');
    assert.doesNotMatch(js,/^const __name=/,label+' must not leak a top-level lexical helper');
  }
});

test('auth and vendor intake load together without __name lexical collisions or false login claims',async()=>{
  const auth=await localRegionAdminAuthScript().text();
  const vendor=await cheonggyePassVendorIntakeScript().text();
  // Model the named-function annotation that esbuild keepNames inserts at build time.
  const withBundledNameProbe=src=>src.replace(prelude,prelude+
    '__name(function compiledMember(){}, "compiledMember");\n');
  const context=createContext({
    document:{
      documentElement:{dataset:{ekodiRegionSurface:'public'}},
      querySelector(){return null},
    }
  });
  assert.doesNotThrow(()=>new Script(withBundledNameProbe(auth)+'\n'+withBundledNameProbe(vendor))
    .runInContext(context,{timeout:3000}));
  assert.equal(context.__name,undefined,'private name helpers may not leak to global scope');
});

test('local-region auth and vendor intake still preserve native return-to and tenant authorization routes',async()=>{
  const auth=await localRegionAdminAuthScript().text();
  const vendor=await cheonggyePassVendorIntakeScript().text();
  assert.match(auth,/return_to/);
  assert.match(auth,/regionAuthReady/);
  assert.match(auth,/\/api\/local-access\//);
  assert.match(vendor,/\/api\/cheonggyepass\/vendor-intake/);
  assert.match(vendor,/tenant\.integration\.inspect/);
  assert.match(vendor,/cache:'no-store'/);
});
