import test from 'node:test';
import assert from 'node:assert/strict';
import { planFleetReleaseImpact, validReleaseSourcePattern } from '../scripts/plan-fleet-release-impact.mjs';
const manifest={
 version:1,
 platforms:{
   'ekodi-shell':{source:['shell/**','ekodi-shell-worker.js'],deployWorkflow:'.github/workflows/deploy-ekodi-shell.yml'},
   'site-core':{source:['site-worker.js'],deployWorkflow:'.github/workflows/deploy-site-core.yml'},
   mall:{source:['sites/ekodi-mall/**'],deployWorkflow:'.github/workflows/deploy-ekodi-mall.yml',sharedDependencies:['ekodi-shell']},
   books:{source:['books/**','books-worker.js'],deployWorkflow:'.github/workflows/deploy-books.yml'},
   publishing:{source:['publishing/**'],deployWorkflow:'.github/workflows/deploy-publishing.yml',sharedDependencies:['ekodi-shell']},
   proxy:{source:['service-proxy.js'],deployWorkflow:'.github/workflows/deploy-proxy.yml',sharedDependencies:['ekodi-shell']}
 }
};
test('mall-only source change proposes only Mall protected release',()=>{
 const r=planFleetReleaseImpact(manifest,['sites/ekodi-mall/index.html']);
 assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.directReleaseUnits.map(x=>x.id),['mall']);
 assert.deepEqual(r.downstreamRegressionUnits,[]);
 assert.equal(r.criticalSharedChange,false);
 assert.equal(r.deployApproved,false);
 assert.equal(r.productionMutationPerformed,false);
});
test('shared Shell modification brings dependent releases into regression scope but does not authorize deploy',()=>{
 const r=planFleetReleaseImpact(manifest,['ekodi-shell-worker.js']);
 assert.deepEqual(r.directReleaseUnits.map(x=>x.id),['ekodi-shell']);
 assert.deepEqual(r.downstreamRegressionUnits.map(x=>x.id),['mall','proxy','publishing']);
 assert.equal(r.criticalSharedChange,true);
 assert.equal(r.deployApproved,false);
});
test('overlapping source patterns preserve both release owners',()=>{
 const m=structuredClone(manifest);
 m.platforms.books.source.push('sites/ekodi-mall/**');
 const r=planFleetReleaseImpact(m,['sites/ekodi-mall/assets/app.js']);
 assert.deepEqual(r.pathOwnership[0].directReleaseUnitIds,['books','mall']);
});
test('unowned source changes remain unresolved, never auto-deploy every unit',()=>{
 const r=planFleetReleaseImpact(manifest,['config/unknown-global.json']);
 assert.deepEqual(r.directReleaseUnits,[]);
 assert.equal(r.sourceOwnershipReviewRequired,true);
 assert.deepEqual(r.unmatchedChangedPaths,['config/unknown-global.json']);
});
test('malformed source glob and changed path fail closed',()=>{
 assert.equal(validReleaseSourcePattern('../secrets/**'),false);
 assert.equal(validReleaseSourcePattern('sites/site/**'),true);
 const m=structuredClone(manifest);
 m.platforms.mall.source=['../unknown/**'];
 const r=planFleetReleaseImpact(m,['../secret.txt']);
 assert.ok(r.errors.some(x=>x.includes('Unsafe or unsupported')));
 assert.ok(r.errors.includes('unsafe path input'));
});
test('descriptive dependencies are not treated as deploy authority',()=>{
 const m=structuredClone(manifest);
 m.platforms.mall.sharedDependencies=['existing shared shell API'];
 const r=planFleetReleaseImpact(m,['shell/nav.js']);
 assert.deepEqual(r.downstreamRegressionUnits.map(x=>x.id),['proxy','publishing']);
});
