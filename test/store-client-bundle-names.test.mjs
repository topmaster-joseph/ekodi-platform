import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, createContext } from 'node:vm';
import { storeAdminScript, STORE_ADMIN_NAME_PRELUDE } from '../store-admin-engine.js';
import { storePortfolioAdminPanelScript, storePortfolioAdminShellScript, CMPMYI_NAME_PRELUDE } from '../store-portfolio-admin-page.js';

// Wrangler bundles with esbuild keepNames, which inserts __name(fn,"name") calls into
// nested functions; they survive Function.prototype.toString(). Production showed the
// store mobile console stuck on "운영 데이터를 불러오고 있습니다" and the CMPMYI Agent
// page stuck on "연결상태를 확인하고 있습니다" for exactly this reason (2026-10-24).
const scripts=[
  ['store admin',()=>storeAdminScript(),STORE_ADMIN_NAME_PRELUDE],
  ['cmpmyi panel',()=>storePortfolioAdminPanelScript(),CMPMYI_NAME_PRELUDE],
  ['cmpmyi shell',()=>storePortfolioAdminShellScript(),CMPMYI_NAME_PRELUDE],
];
for(const [label,make,prelude] of scripts){
  test(`${label} browser script survives esbuild keepNames without leaking __name`,async()=>{
    const js=await make().text();
    assert.ok(js.startsWith(prelude),`${label} lacks the private __name helper`);
    assert.ok(js.trimEnd().endsWith('})();'),`${label} must close its isolated IIFE`);
    // Model the annotation esbuild keepNames inserts at build time, then stop before DOM work.
    const bundled=js.replace(prelude,`${prelude}__name(function compiledMember(){}, "compiledMember");\nreturn;\n`);
    const context=createContext({});
    assert.doesNotThrow(()=>new Script(bundled).runInContext(context,{timeout:3000}));
    assert.equal(context.__name,undefined,`${label} may not leak __name to global scope`);
    // And the unbundled script still parses as one program.
    assert.doesNotThrow(()=>new Script(js));
  });
}
