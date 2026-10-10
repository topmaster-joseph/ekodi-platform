import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [demand,deployments,layout]=await Promise.all([
 readFile(new URL('../admin-demand-loader.js',import.meta.url),'utf8'),
 readFile(new URL('../release-control-admin.js',import.meta.url),'utf8'),
 readFile(new URL('../admin-menu-layout.js',import.meta.url),'utf8'),
]);

test('Deployments loader does not confuse existing navigation button with authorized panel readiness',()=>{
 assert.match(demand,/deployments:\{[^\n]*real:'\[data-section="deployments"\]',ready:'#releaseControl'/);
 const loadScripts=demand.search(/for \(const src of feature\.scripts\s*\|\|\s*\[\]\) await loadScript\(src\)/);
 const navReady=demand.search(/const real\s*=\s*await waitFor\(feature\.real\)/);
 const actualReady=demand.indexOf('if(feature.ready)await waitFor(feature.ready,1e4)');
 const placeholderRestore=demand.indexOf('placeholder.removeAttribute(\'data-demand-feature\')');
 assert.ok(loadScripts>=0&&loadScripts<navReady&&navReady<actualReady&&actualReady<placeholderRestore);
});

test('Deployments content remains super-admin only, without synthetic auth or bypass',()=>{
 assert.match(deployments,/if \(role === 'super_admin'\) installDeploymentsControl\(\)/);
 assert.match(deployments,/else removeDeploymentsControl\(\)/);
 assert.match(deployments,/if \(!token\(\)\) \{/);
 assert.match(deployments,/section.id = 'releaseControl'/);
 const append=deployments.indexOf('content.append(section)');
 const event=deployments.indexOf("new CustomEvent('ekodi-feature-installed'");
 assert.ok(append>=0&&event>append);
});

test('The existing section reconciler only marks Deployments active after its panel is mounted',()=>{
 assert.match(layout,/if\(!activatePanel\(requestedSection\)\)requestDemand\(requestedSection\)/);
 assert.match(layout,/window.addEventListener\('ekodi-nav-changed',scheduleNav\)/);
 assert.match(layout,/const hasPanel=section=>Boolean/);
});
