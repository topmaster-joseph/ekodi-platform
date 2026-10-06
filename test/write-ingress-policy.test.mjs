import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('durable write ingress policy remains queue-first while SeonamMedi citizen opinions use the standalone board route',async()=>{
  const [policyText,trafficText,wrangler,ingress,html,router,workflow]=await Promise.all([
    read('config/write-ingress-policy.json'),read('config/concurrent-traffic-policy.json'),read('wrangler.site.toml'),read('write-ingress.js'),read('sites/seonammedi/public/index.html'),read('platform-router-entry-worker.js'),read('.github/workflows/deploy-site-core.yml')
  ]);
  const policy=JSON.parse(policyText),traffic=JSON.parse(trafficText);
  assert.equal(policy.status,'enforced');
  assert.equal(policy.ingress.productionQueueRequired,true);
  assert.equal(traffic.writePlane.publicBurstEligibleWrites,'queue-first');
  assert.match(wrangler,/binding = "EKODI_WRITE_QUEUE"/);
  assert.match(ingress,/durable_queue_acceptance_required_before_success_response/);
  assert.match(html,/href="\/board"[^>]*>시민의견<\/a>/);
  assert.doesNotMatch(html,/id="voices"/);
  assert.match(router,/async queue\(batch,env\)/);
  assert.match(workflow,/Ensure durable write queues/);
});
