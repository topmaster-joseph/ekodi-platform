import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Cloudflare Workers fetch only implements redirect 'follow' | 'manual';
// redirect:'error' throws "Invalid redirect value" before any request is sent
// (observed on the points governance API, #6739). Worker-runtime modules must
// use 'manual' and treat a 3xx as a failed upstream response.
const WORKER_MODULES=['points-control.js','church-reports-control.js','church-public-worship-control.js',
  'age-verification-core.js','age-verification-sandbox.js','management-worker.js','google-search-console-readonly.js',
  'invest-opendart-readonly.js','community-reports-control.js','o2o-issued-links.js','sites/ekodi-mall/api/domemae.js'];

test('Worker runtime modules never use redirect:error',()=>{
  for(const file of WORKER_MODULES){
    const src=fs.readFileSync(file,'utf8').replace(/\/\/.*$/gm,'');
    assert.doesNotMatch(src,/redirect\s*:\s*['"]error['"]/,file);
  }
});
