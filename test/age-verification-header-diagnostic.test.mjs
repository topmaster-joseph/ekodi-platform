import { test } from 'node:test';
import assert from 'node:assert/strict';

// Read-only production protocol diagnosis. Draft PR only; never ship this test into main.
// No cookies, credentials, response bodies, private user data or secrets are logged.
test('read-only EKODI age verification production response headers', async () => {
  const paths = [
    '/verify/adult/?site=singles',
    '/verify/adult/styles.css',
    '/verify/adult/app.js',
    '/verify/adult/client.js',
    '/singles/vendor/supabase-js-2.117.3.umd.js',
    '/api/age-verification/config?site=singles'
  ];
  for(const path of paths) {
    let response;
    try {
      response = await fetch('https://ekodi.kr' + path, {
        redirect:'manual',
        headers: { 'cache-control': 'no-cache', 'user-agent': 'ekodi-header-diagnostic-ci' },
        signal: AbortSignal.timeout(18000)
      });
    } catch(error) {
      console.log('EKODI_AGE_HEADER_PROBE', path, 'fetch_error=' + String(error?.cause?.code || error?.name || 'unknown'));
      continue;
    }
    const headers = Object.fromEntries([
      'content-type','content-security-policy','x-content-type-options',
      'x-ekodi-route','x-ekodi-canonical-surface','cache-control',
      'x-robots-tag', 'location'
    ].map(k=>[k, response.headers.get(k)||'']));
    console.log('EKODI_AGE_HEADER_PROBE', JSON.stringify({path,status:response.status,headers}));
    assert.ok(response.status>=200 && response.status<600);
  }
});
