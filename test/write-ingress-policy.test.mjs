import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('durable write ingress policy is enforced and queue-first in production',async()=>{
  const [policyText,trafficText,wrangler,ingress,civic,router,workflow]=await Promise.all([
    read('config/write-ingress-policy.json'),
    read('config/concurrent-traffic-policy.json'),
    read('wrangler.site.toml'),
    read('write-ingress.js'),
    read('seonammedi-civic-control.js'),
    read('platform-router-entry-worker.js'),
    read('.github/workflows/deploy-site-core.yml')
  ]);
  const policy=JSON.parse(policyText),traffic=JSON.parse(trafficText);
  assert.equal(policy.status,'enforced');
  assert.equal(policy.appliesRecursivelyToAllServices,true);
  assert.equal(policy.ingress.productionQueueRequired,true);
  assert.equal(policy.ingress.directDatabaseWriteForbiddenForBurstEligiblePublicWrites,true);
  assert.equal(policy.ingress.successRequiresDurableAcceptance,true);
  assert.equal(policy.failure.falseSuccessForbidden,true);
  assert.equal(traffic.writePlane.publicBurstEligibleWrites,'queue-first');
  assert.equal(traffic.writePlane.productionDirectDatabaseWrite,'forbidden');
  assert.match(wrangler,/binding = "EKODI_WRITE_QUEUE"/);
  assert.match(wrangler,/queue = "ekodi-write-ingress"/);
  assert.match(wrangler,/dead_letter_queue = "ekodi-write-ingress-dlq"/);
  assert.match(ingress,/durable_queue_acceptance_required_before_success_response/);
  assert.match(civic,/enqueueDurableWrite/);
  assert.match(civic,/submissionId=crypto\.randomUUID\(\)/);
  assert.match(civic,/durable_queue_unavailable/);
  assert.match(civic,/retry-after/);
  assert.match(router,/async queue\(batch,env\)/);
  assert.match(router,/message\.ack\(\)/);
  assert.match(router,/message\.retry\(\)/);
  assert.match(workflow,/Ensure durable write queues/);
  assert.match(workflow,/validate-write-ingress-policy\.mjs/);
});

test('seonammedi public voice success requires durable acceptance id',async()=>{
  const [html,app,civic]=await Promise.all([
    read('sites/seonammedi/public/index.html'),
    read('sites/seonammedi/public/app.js'),
    read('seonammedi-civic-control.js')
  ]);
  assert.doesNotMatch(html,/name="website"/);
  assert.match(app,/!body\.submissionId/);
  assert.match(app,/submitButton\.disabled=true/);
  assert.match(civic,/status=202|},202\)/);
  assert.match(civic,/submission_key/);
  assert.match(civic,/CREATE UNIQUE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_submission/);
});
