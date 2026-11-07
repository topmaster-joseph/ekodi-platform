import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSourceDeploymentBoundaries } from '../scripts/audit-site-source-release-boundaries.mjs';

const boundary = {
  version:1,
  platforms:{
    books:{source:['books/**'],deployWorkflow:'.github/workflows/deploy-books.yml'},
    mall:{source:['sites/ekodi-mall/**'],deployWorkflow:'.github/workflows/deploy-mall.yml'},
    shell:{source:['shell/**'],deployWorkflow:'.github/workflows/deploy-books.yml'}
  }
};
const registry = {
  status:'enforced',canonicalPlatformRepository:'topmaster-joseph/ekodi-platform',
  repositories:[
    {name:'topmaster-joseph/ekodi-platform',role:'canonical-platform',mutationMode:'guarded-pr'},
    {name:'topmaster-joseph/ekodi-church',role:'active-satellite',mutationMode:'scope-specific-guarded-pr'}
  ]
};

test('one source repository can own independently deployed release units', () => {
  const report = auditSourceDeploymentBoundaries(boundary,registry);
  assert.deepEqual(report.errors,[]);
  assert.equal(report.registeredReleaseBoundaries,3);
  assert.equal(report.distinctDeploymentWorkflows,2);
  assert.equal(report.allTenantSitesAudited,false);
  assert.equal(report.allSatellitesMigrated,false);
  assert.equal(report.registeredSatelliteRepositories[0].name,'topmaster-joseph/ekodi-church');
});

test('audit fails invalid ownership and deployment contracts without rewriting live state', () => {
  const report = auditSourceDeploymentBoundaries({
    version:1,platforms:{bad:{source:[],deployWorkflow:'deploy-all'}}
  },registry);
  assert.equal(report.errors.length,2);
  assert.equal(report.mode,'read-only-inventory');
});

test('audit detects lack of canonical repository and unclassified satellites', () => {
  const report = auditSourceDeploymentBoundaries(boundary,{
    status:'enforced',canonicalPlatformRepository:'topmaster-joseph/ekodi-platform',
    repositories:[{name:'other/site',role:'unclassified-satellite',mutationMode:'blocked-pending-scope-verification'}]
  });
  assert.ok(report.errors.includes('exactly one canonical platform repository must be registered'));
  assert.deepEqual(report.undecidedSourceClassification,['other/site']);
});


test('two independent platforms cannot silently share one deploy workflow', () => {
  const input={version:1,platforms:{
    mall:{kind:'independent-platform',source:['sites/ekodi-mall/**'],deployWorkflow:'.github/workflows/deploy-all.yml'},
    church:{kind:'independent-platform',source:['sites/ekodi-church/**'],deployWorkflow:'.github/workflows/deploy-all.yml'}
  }};
  const report=auditSourceDeploymentBoundaries(input,registry);
  assert.equal(report.registeredReleaseBoundaries,2);
  assert.equal(report.distinctDeploymentWorkflows,1);
  assert.equal(report.independentReleaseUnits.length,2);
  assert.equal(report.errors.length,2);
  assert.ok(report.errors.every(x=>x.includes('independent release unit shares deployment workflow')));
  assert.equal(report.actualProductionDeploymentBindingsChecked,false);
});

test('independent site cannot reuse a shared site-core release workflow', () => {
  const input={version:1,platforms:{
    'site-core':{kind:'shared-edge-runtime',source:['site-worker.js'],deployWorkflow:'.github/workflows/deploy-site-core.yml'},
    'mail-service':{kind:'shared-provider-neutral-service',source:['mail-control.js'],deployWorkflow:'.github/workflows/deploy-site-core.yml'},
    church:{kind:'independent-platform',source:['sites/ekodi-church/**'],deployWorkflow:'.github/workflows/deploy-site-core.yml'}
  }};
  const report=auditSourceDeploymentBoundaries(input,registry);
  assert.equal(report.errors.length,1);
  assert.match(report.errors[0],/^church: independent release unit shares deployment workflow/);
});

test('shared runtime lane reuse is allowed while separately deployed independent sites stay separate', () => {
  const input={version:1,platforms:{
    'site-core':{kind:'shared-edge-runtime',source:['site-worker.js'],deployWorkflow:'.github/workflows/deploy-site-core.yml'},
    'mail-service':{kind:'shared-provider-neutral-service',source:['mail-control.js'],deployWorkflow:'.github/workflows/deploy-site-core.yml'},
    church:{kind:'independent-platform',source:['sites/ekodi-church/**'],deployWorkflow:'.github/workflows/deploy-church.yml'},
    lab:{kind:'independent-platform',source:['sites/ekodi-lab/**'],deployWorkflow:'.github/workflows/deploy-lab.yml'}
  }};
  const report=auditSourceDeploymentBoundaries(input,registry);
  assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.sharedWorkflowGroups,[{
    deployWorkflow:'.github/workflows/deploy-site-core.yml',units:['site-core','mail-service']
  }]);
  assert.deepEqual(report.independentReleaseUnits.map(x=>x.id).sort(),['church','lab']);
});

test('the actual protected fleet registry retains distinct independent lanes without claiming live cutover',async () => {
  const {readFile}=await import('node:fs/promises');
  const boundaries=JSON.parse(await readFile(new URL('../platform-boundaries.json',import.meta.url),'utf8'));
  const registry=JSON.parse(await readFile(new URL('../config/repository-source-of-truth.json',import.meta.url),'utf8'));
  const report=auditSourceDeploymentBoundaries(boundaries,registry);
  assert.deepEqual(report.errors,[]);
  assert.ok(report.registeredReleaseBoundaries>=33);
  assert.equal(report.registeredSatelliteRepositories.length,registry.repositories.filter(item=>item.name!==registry.canonicalPlatformRepository).length);
  assert.ok(report.independentReleaseUnits.length>10);
  assert.equal(report.actualProductionDeploymentBindingsChecked,false);
  assert.equal(report.allSatellitesMigrated,false);
});
