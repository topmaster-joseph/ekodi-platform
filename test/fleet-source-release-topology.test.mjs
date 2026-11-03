import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFleetSourceReleaseTopology } from '../scripts/audit-fleet-source-release-topology.mjs';

const fixture = () => ({
  ecosystem: { services: [
    { id:'church',url:'https://ekodi.kr/ekodichurch',status:'live',productionVerified:true },
    { id:'books',url:'https://ekodi.kr/books',status:'live',productionVerified:true }
  ]},
  lifecycle: { existingWorkspaceSites: [
    { id:'ekodi-church',canonicalUrl:'https://ekodi.kr/ekodichurch',migrationState:'retain_existing',runtime:'tenant_customer_site' },
    { id:'jadam',canonicalUrl:'https://ekodi.kr/jadam',runtime:'store_user_sites' }
  ]},
  boundaries: { version:1,platforms: {
    books:{kind:'independent-platform',source:['books/**'],deployWorkflow:'.github/workflows/deploy-books.yml'},
    'site-core':{kind:'shared-edge-runtime',source:['site-worker.js'],deployWorkflow:'.github/workflows/deploy-site-core.yml'}
  }},
  repositories:{ canonicalPlatformRepository:'topmaster-joseph/ekodi-platform',repositories:[
    {name:'topmaster-joseph/ekodi-platform',role:'canonical-platform'},
    {name:'topmaster-joseph/ekodi-church',role:'active-satellite',mutationMode:'scope-specific-guarded-pr'}
  ]}
});

test('accounts for services, workspaces, deployments and repositories separately', () => {
  const result = auditFleetSourceReleaseTopology(fixture());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.totals, {
    registeredServices:2,registeredWorkspaceSites:2,registeredReleaseBoundaries:2,
    registeredSourceRepositories:2,registeredSatelliteRepositories:1
  });
  assert.equal(result.inventoryScope.dynamicWorkspaceSitesChecked,false);
  assert.equal(result.inventoryScope.liveProviderBindingsChecked,false);
  assert.equal(result.globalMigrationComplete,false);
  assert.equal(result.knownOverlappingCanonicalPaths[0].canonicalPath,'/ekodichurch');
  assert.deepEqual(result.noDirectUnitIdForServices,['church']);
  assert.deepEqual(result.noDirectUnitIdForWorkspaces,['ekodi-church','jadam']);
});

test('a shared runtime does not require per-site deployment or pretend to verify it', () => {
  const result = auditFleetSourceReleaseTopology(fixture());
  assert.equal(result.serviceInventory.find(x=>x.id==='books').directReleaseBoundaryId,'books');
  assert.equal(result.serviceInventory.find(x=>x.id==='church').directReleaseBoundaryId,null);
  assert.equal(result.satelliteSourceReview[0].migrationVerified,false);
});

test('invalid or duplicate canonical paths fail closed', () => {
  const input = fixture();
  input.ecosystem.services[1].url='https://other.example/books';
  assert.ok(auditFleetSourceReleaseTopology(input).errors.some(x=>x.includes('noncanonical')));
  input.ecosystem.services[1].url='https://ekodi.kr/ekodichurch';
  assert.ok(auditFleetSourceReleaseTopology(input).errors.some(x=>x.includes('duplicate service path')));
});

test('unclassified satellite remains blocked and incomplete registry fails validation', () => {
  const input=fixture();
  input.repositories.repositories[1].role='unclassified-satellite';
  input.repositories.repositories[1].mutationMode='blocked-pending-scope-verification';
  const report=auditFleetSourceReleaseTopology(input);
  assert.equal(report.satelliteSourceReview[0].requiredAction,'verify ownership before any write');
  assert.equal(report.warnings.length,1);
  const bad=auditFleetSourceReleaseTopology({...input, lifecycle:{}});
  assert.ok(bad.errors.includes('missing lifecycle workspace sites registry'));
});
