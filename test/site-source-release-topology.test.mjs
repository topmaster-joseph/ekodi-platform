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
