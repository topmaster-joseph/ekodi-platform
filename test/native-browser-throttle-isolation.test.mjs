import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/ekodi-background-browser-worker.yml',import.meta.url),'utf8');
const worker=await readFile(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');

test('ordinary EKODI PR browser canaries do not silently run nine extra Church page loads',()=>{
  assert.match(workflow,/church_locale_diagnostic:\s+description:[\s\S]*?default: false/);
  assert.match(workflow,/name: EKODI native Church nine-language diagnostic\s+if: inputs\.church_locale_diagnostic == true/);
  assert.doesNotMatch(workflow,/github\.event_name == 'pull_request' \|\| inputs\.church_locale_diagnostic/);
  assert.match(workflow,/name: Run EKODI-owned isolated browser/);
});

test('Cloudflare 429 remains a reported failure, never bypassed after native bounded retry',()=>{
  assert.match(worker,/const transient=\[429,502,503,504\]/);
  assert.match(worker,/BROWSER_NAVIGATION_THROTTLED/);
  assert.match(worker,/const headerRetry=Number\(response\?\.headers\(\)\?\.\['retry-after'\]\|\|0\)/);
  assert.match(worker,/recoveredNavigations\.push\(record\)/);
});
