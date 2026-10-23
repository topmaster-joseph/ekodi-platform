import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {storeAdminScript} from '../store-admin-engine.js';
import {storePortfolioAdminShellScript,storePortfolioAdminPanelScript} from '../store-portfolio-admin-page.js';

// Wrangler bundles with esbuild keepNames, which inserts __name(fn,"name") calls into every
// function body. Serialized clients (fn.toString()) carry those calls to the browser, where
// __name does not exist. Without a prelude the store admin died on its first line and stayed
// on "운영 데이터를 불러오고 있습니다" forever (2026-10-23 production incident).
for (const [label, make] of [['store admin', storeAdminScript], ['cmpmyi shell', storePortfolioAdminShellScript], ['cmpmyi panel', storePortfolioAdminPanelScript]]) {
  test(`${label} client defines __name before running serialized code`, async () => {
    const js = await make().text();
    const prelude = js.indexOf('const __name=');
    assert.ok(prelude >= 0, 'missing __name prelude');
    assert.ok(prelude < js.indexOf('.toString') || js.indexOf('.toString') === -1);
    // A keepNames-style call injected right after the prelude must not throw.
    const probe = js.replace('configurable:true});\n', 'configurable:true});\n__name(function probe(){},"probe");throw new Error("PRELUDE_OK");\n');
    assert.throws(() => vm.runInNewContext(probe, {}), /PRELUDE_OK/);
  });
}
