// No live rights or credentials: tests only the Development staging wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyBoundPublisherRelease} from '../publishing/human/publisher-release-rpc-service.js';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stagingBooks=load('wrangler.books.staging.toml');
const stagingPublishing=load('wrangler.publishing.staging.toml');
const stagingMallWorkflow=load('.github/workflows/deploy-ekodi-mall.yml');
const productionBooks=load('wrangler.books.toml');
const productionMall=load('sites/ekodi-mall/api/wrangler.toml');
const service=load('publishing-release-entry.js');

const BOOKS_BIND=\`[[services]]
binding = "PUBLISHING_RELEASE_GATE"
service = "ekodi-publishing-staging"
entrypoint = "BooksPublisherReleaseGate"\`;
const MALL_BIND=\`[[services]]
          binding = "PUBLISHING_RELEASE_GATE"
          service = "ekodi-publishing-staging"
          entrypoint = "MallPublisherReleaseGate"\`;

test('Books can reach only its protected Publisher RPC in Development staging',()=>{
  assert.ok(stagingBooks.includes(BOOKS_BIND));
  assert.ok(service.includes('class BooksPublisherReleaseGate extends WorkerEntrypoint'));
  assert.ok(service.includes("verifyBoundPublisherRelease(this.env,'books'"));
  assert.ok(!stagingBooks.includes('MallPublisherReleaseGate'));
});
test('Mall runtime-staging config uses distinct private Publisher RPC; no consumer channel selector',()=>{
  assert.ok(stagingMallWorkflow.includes(MALL_BIND));
  assert.ok(service.includes('class MallPublisherReleaseGate extends WorkerEntrypoint'));
  assert.ok(service.includes("verifyBoundPublisherRelease(this.env,'ekodimall'"));
  assert.equal(stagingMallWorkflow.match(/entrypoint = "MallPublisherReleaseGate"/g)?.length,1);
  assert.ok(!stagingMallWorkflow.includes('entrypoint = "BooksPublisherReleaseGate"'));
});
test('Development release flag and both commercial production configurations remain fail-closed',()=>{
  assert.match(stagingPublishing,/main = "publishing-release-entry.js"/);
  assert.match(stagingPublishing,/PUBLISHING_PRIVATE_RELEASE_ENABLED = "false"/);
  assert.doesNotMatch(stagingPublishing,/\[\[services\]\]/);
  assert.doesNotMatch(productionBooks,/PUBLISHING_RELEASE_GATE/);
  assert.doesNotMatch(productionMall,/PUBLISHING_RELEASE_GATE/);
  assert.match(stagingMallWorkflow,/PAYMENTS_ENABLED = "false"/);
  assert.match(stagingMallWorkflow,/TRANSACTION_REHEARSAL_ENABLED = "false"/);
});
test('named RPC still denies unknown, swapped or unverified release requests without private verified evidence',async()=>{
  const input={publicationId:'publ-123',editionId:'edition-123',releaseDigest:'sha256:'+'a'.repeat(64)};
  for(const ch of ['books','ekodimall']){
    const authorized=await verifyBoundPublisherRelease({PUBLISHING_PRIVATE_RELEASE_ENABLED:'false'},ch,input,'2026-11-03T06:00:00.000Z');
    assert.deepEqual(authorized,{authorized:false,channel:ch});
    const swapped=await verifyBoundPublisherRelease({},ch,{...input,channel:ch==='books'?'ekodimall':'books'},'2026-11-03T06:00:00.000Z');
    assert.deepEqual(swapped,{authorized:false,channel:ch});
  }
  assert.equal((await verifyBoundPublisherRelease({},'fake',input,'2026-11-03T06:00:00.000Z')).authorized,false);
});
