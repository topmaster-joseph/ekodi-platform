import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const status=await readFile(new URL('../church-online-status.js',import.meta.url),'utf8');

test('online status polling avoids overlap and times out stalled requests',()=>{
  assert.match(status,/if\(document\.hidden\)return/);
  assert.match(status,/if\(inFlight\)return inFlight/);
  assert.match(status,/new AbortController\(\)/);
  assert.match(status,/setTimeout\(\(\)=>controller\.abort\(\),8000\)/);
  assert.match(status,/signal:controller\.signal/);
});

test('online status keeps last known state through transient failures',()=>{
  assert.match(status,/if\(lastKnown\)/);
  assert.match(status,/liveStatus='stale'/);
  assert.match(status,/liveStatus='unknown'/);
  assert.match(status,/setInterval\(refresh,60000\)/);
  assert.match(status,/addEventListener\('online',refresh\)/);
  assert.match(status,/visibilitychange/);
});