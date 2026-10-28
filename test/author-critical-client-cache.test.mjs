import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const worker=readFileSync(new URL('../author-worker.js',import.meta.url),'utf8');
const author=readFileSync(new URL('../author/human-writer.js',import.meta.url),'utf8');

test('private interview and billing-critical JavaScript use no-store after protected deployment',()=>{
  assert.match(worker,/criticalClientModule\s*=\s*\/\^\\\//);
  for(const name of ['app','billing','human-writer','-entitlement','-notes']){
    assert.ok(worker.includes(name),'missing critical client asset '+name);
  }
  assert.match(worker,/criticalClientModule \? 'no-store' : 'public, max-age=300'/);
  assert.match(worker,/Cache-Control', cache/);
  assert.match(worker,/cache = 'public, max-age=120'/);
  assert.match(author,/import \{ latestSavedByStage, hasUnsavedInterviewDrafts, assemblePrivateInterviewNotes \} from '.\/human-writer-notes.js'/);
  assert.match(author,/import \{ mayAppendHumanInterview \} from '.\/human-writer-entitlement.js'/);
});

test('worker leaves noncritical public assets cacheable without weakening privacy CSP',()=>{
  assert.match(worker,/return injectEkodiShell\(secure\(response, criticalClientModule/);
  assert.match(worker,/frame-ancestors 'none'/);
  assert.match(worker,/Referrer-Policy/);
  assert.match(worker,/Permissions-Policy/);
});
