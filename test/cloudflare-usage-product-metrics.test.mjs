import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  collectD1Usage,
  collectKVUsage,
  collectR2Usage,
  collectDurableObjectUsage,
  collectProductUsage,
} from '../scripts/cloudflare-usage-product-metrics.mjs';

const account = { label:'PROD', accountId:'account-1', token:'secret' };
const window = { start:'2026-09-04T01:00:00.000Z', end:'2026-09-05T01:00:00.000Z' };

test('D1 usage preserves rows read per database and read-query efficiency signal', async () => {
  const gql = async () => ({ data:{ viewer:{ accounts:[{ d1AnalyticsAdaptiveGroups:[
    { dimensions:{ date:'2026-09-04', databaseId:'db-1' }, sum:{ readQueries:8, writeQueries:1, rowsRead:4000, rowsWritten:5 } },
    { dimensions:{ date:'2026-09-05', databaseId:'db-1' }, sum:{ readQueries:2, writeQueries:1, rowsRead:1000, rowsWritten:2 } },
    { dimensions:{ date:'2026-09-05', databaseId:'db-2' }, sum:{ readQueries:5, writeQueries:0, rowsRead:100, rowsWritten:0 } },
  ] }] } } });
  const cf = async () => ({ result:[{ uuid:'db-1', name:'ekodi-auth' },{ uuid:'db-2', name:'other' }] });
  const result = await collectD1Usage(account, window, gql, cf);
  assert.equal(result.available, true);
  assert.equal(result.rowsRead, 5100);
  assert.equal(result.readQueries, 15);
  assert.equal(result.databases[0].database, 'ekodi-auth');
  assert.equal(result.databases[0].rowsReadPerReadQuery, 500);
  assert.equal(result.granularity, 'calendar-date');
  assert.equal(result.currentDate.date, '2026-09-05');
  assert.equal(result.currentDate.rowsRead, 1100);
  assert.equal(result.currentDate.readQueries, 7);
  assert.equal(result.currentDate.databases[0].database, 'ekodi-auth');
});
test('KV, R2 and Durable Objects aggregate their official analytics datasets', async () => {
  const gql = async (_account, query) => {
    if (query.includes('kvOperationsAdaptiveGroups')) return { data:{ viewer:{ accounts:[{ kvOperationsAdaptiveGroups:[
      { dimensions:{ actionType:'read' }, sum:{ requests:120 } },
      { dimensions:{ actionType:'write' }, sum:{ requests:8 } },
    ] }] } } };
    if (query.includes('r2OperationsAdaptiveGroups')) return { data:{ viewer:{ accounts:[{ r2OperationsAdaptiveGroups:[
      { dimensions:{ bucketName:'cache', actionType:'GetObject', actionStatus:'success' }, sum:{ requests:50 } },
      { dimensions:{ bucketName:'cache', actionType:'PutObject', actionStatus:'userError' }, sum:{ requests:3 } },
    ] }] } } };
    if (query.includes('durableObjectsInvocationsAdaptiveGroups')) return { data:{ viewer:{ accounts:[{ durableObjectsInvocationsAdaptiveGroups:[
      { sum:{ requests:12, responseBodySize:2048 } },
    ] }] } } };
    throw new Error('unexpected query');
  };
  const kv = await collectKVUsage(account, window, gql);
  const r2 = await collectR2Usage(account, window, gql);
  const durable = await collectDurableObjectUsage(account, window, gql);
  assert.equal(kv.requests, 128);
  assert.equal(kv.actions[0].action, 'read');
  assert.equal(r2.requests, 53);
  assert.equal(r2.errorRequests, 3);
  assert.equal(durable.requests, 12);
  assert.equal(durable.responseBodySize, 2048);
});
test('product analytics degrade independently when one dataset permission is unavailable', async () => {
  const gql = async (_account, query) => {
    if (query.includes('d1AnalyticsAdaptiveGroups')) throw new Error('D1 analytics forbidden');
    if (query.includes('kvOperationsAdaptiveGroups')) return { data:{ viewer:{ accounts:[{ kvOperationsAdaptiveGroups:[] }] } } };
    if (query.includes('r2OperationsAdaptiveGroups')) return { data:{ viewer:{ accounts:[{ r2OperationsAdaptiveGroups:[] }] } } };
    if (query.includes('durableObjectsInvocationsAdaptiveGroups')) return { data:{ viewer:{ accounts:[{ durableObjectsInvocationsAdaptiveGroups:[] }] } } };
    throw new Error('unexpected query');
  };
  const cf = async () => ({ result:[] });
  const result = await collectProductUsage(account, window, gql, cf);
  assert.equal(result.d1.available, false);
  assert.match(result.d1.warning, /D1 analytics forbidden/);
  assert.equal(result.kv.available, true);
  assert.equal(result.r2.available, true);
  assert.equal(result.durableObjects.available, true);
});

test('diagnostic v2 keeps the five-check order and worker status visibility', () => {
  const source = fs.readFileSync(new URL('../scripts/diagnose-cloudflare-usage.mjs', import.meta.url), 'utf8');
  assert.match(source, /1\. Workers:/);
  assert.match(source, /2\. D1:/);
  assert.match(source, /3\. KV\/R2\/DO:/);
  assert.match(source, /4\. Bots\/Cron\/Health:/);
  assert.match(source, /5\. DEV->PROD boundary:/);
  assert.match(source, /dimensions \{ scriptName status \}/);
  assert.match(source, /nonOkStatuses/);
  assert.match(source, /'ok','success','unknown'/);
  assert.match(source, /since 00:00 UTC/);
});

test('diagnostic workflow validates and watches the product metrics module', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/cloudflare-usage-root-cause-diagnose.yml', import.meta.url), 'utf8');
  assert.match(workflow, /scripts\/cloudflare-usage-product-metrics\.mjs/);
  assert.match(workflow, /node --check scripts\/cloudflare-usage-product-metrics\.mjs/);
  assert.match(workflow, /scripts\/diagnose-cloudflare-usage\.mjs scripts\/cloudflare-usage-product-metrics\.mjs/);
});
