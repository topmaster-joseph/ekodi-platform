import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSatelliteLiveSourceMarkers, CANONICAL_SOURCE, PUBLIC_MARKER_TARGETS } from '../scripts/audit-satellite-live-source-markers.mjs';

const CHURCH_URL = PUBLIC_MARKER_TARGETS[0].urls[0];
const LAB_URLS = PUBLIC_MARKER_TARGETS[1].urls;
const SHA = 'a'.repeat(40);
const DIGEST = 'b'.repeat(64);
const church = (overrides = {}) => ({contract:'ekodi.church-release.v2',sourceRepository:CANONICAL_SOURCE,sourceSha:SHA,payloadSha256:DIGEST,...overrides});
const lab = (overrides = {}) => ({contract:'ekodi.lab-release.v1',sourceRepository:CANONICAL_SOURCE,sourceSha:SHA,...overrides});
const mock = mapping => async url => {
  if (!(url in mapping)) throw new Error('unexpected-url');
  const item = mapping[url];
  if (item instanceof Error) throw item;
  const body = typeof item?.body === 'string' ? item.body : JSON.stringify(item?.body ?? item);
  return {
    ok: item?.status === undefined || item.status === 200,
    status: item?.status ?? 200,
    headers: {get: () => item?.type || 'application/json'},
    text: async () => body
  };
};
const valid = () => ({[CHURCH_URL]:church(),[LAB_URLS[0]]:lab(),[LAB_URLS[1]]:lab()});

test('source markers may verify, but deletion is never certified',async()=>{
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(valid())});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.readyForRepositoryDeletion,false);
  assert.equal(result.services.length,2);
  for(const s of result.services){
    assert.equal(s.sourceMarkerVerified,true);
    assert.equal(s.cloudflareDeploymentBindingVerified,false);
    assert.equal(s.immutableOffsiteRestoreVerified,false);
    assert.equal(s.repositoryDeletionAuthorized,false);
  }
});

test('legacy Church v1 marker is blocked, independent Lab may still verify',async()=>{
  const mapping=valid();
  mapping[CHURCH_URL]={contract:'ekodi.church-release.v1',sourceRepository:'topmaster-joseph/ekodi-church',sourceSha:SHA};
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(mapping)});
  assert.equal(result.services[0].sourceMarkerVerified,false);
  assert.equal(result.services[0].observations[0].sourceRepository,'topmaster-joseph/ekodi-church');
  assert.equal(result.services[1].sourceMarkerVerified,true);
  assert.equal(result.readyForRepositoryDeletion,false);
});

test('mismatched canonical versus Pages Lab marker fails closed',async()=>{
  const mapping=valid();mapping[LAB_URLS[1]]=lab({sourceSha:'c'.repeat(40)});
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(mapping)});
  assert.equal(result.services[1].sourceMarkerVerified,false);
  assert.equal(result.services[1].blocker,'canonical-pages-marker-mismatch');
});

test('public catch-all HTML cannot pass as a release marker',async()=>{
  const mapping=valid();mapping[CHURCH_URL]={body:'<html>not a marker</html>',type:'text/html'};
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(mapping)});
  assert.equal(result.services[0].observations[0].failure,'non-json-content-type');
  assert.equal(result.services[0].sourceMarkerVerified,false);
});

test('tampered or missing payload SHA fails Church provenance',async()=>{
  const mapping=valid();mapping[CHURCH_URL]=church({payloadSha256:'not-sha256'});
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(mapping)});
  assert.equal(result.services[0].observations[0].failure,'missing-or-invalid-payload-sha256');
});

test('HTTP failure does not suppress independent other services',async()=>{
  const mapping=valid();mapping[CHURCH_URL]={status:503,body:'unavailable'};
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(mapping)});
  assert.equal(result.services[0].observations[0].failure,'http-503');
  assert.equal(result.services[1].sourceMarkerVerified,true);
});

test('network error cannot become repository retirement readiness',async()=>{
  const mapping=valid();mapping[LAB_URLS[1]]=new Error('network-failure');
  const result=await auditSatelliteLiveSourceMarkers({fetcher:mock(mapping)});
  assert.equal(result.services[1].sourceMarkerVerified,false);
  assert.equal(result.readyForRepositoryDeletion,false);
});
