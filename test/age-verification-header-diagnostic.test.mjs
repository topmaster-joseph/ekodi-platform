import {test} from 'node:test';
import assert from 'node:assert/strict';

// Intentionally failing draft-only diagnostics. NEVER MERGE. No secrets or PII.
for (const [label, path] of [
  ['HTML', '/verify/adult/?site=singles'],
  ['CSS', '/verify/adult/styles.css'],
  ['ESM', '/verify/adult/app.js'],
  ['CLIENT', '/verify/adult/client.js']
]) {
  test('READ_ONLY_AGE_HEADER_DIAGNOSTIC_' + label, async () => {
    try {
      const r = await fetch('https://ekodi.kr' + path, {
        headers: {'Cache-Control':'no-cache','User-Agent':'ekodi-public-mime-audit'},
        redirect:'manual',signal:AbortSignal.timeout(12000)
      });
      const keys=['content-type','content-security-policy','x-content-type-options','x-ekodi-route',
        'x-ekodi-canonical-surface','cache-control','x-robots-tag','location'];
      const summary=keys.map(k=>k+'='+JSON.stringify(r.headers.get(k))).join(' ');
      assert.fail('PROTOCOL '+label+' HTTP '+r.status+' '+summary);
    } catch (e) {
      if (String(e.message||'').startsWith('PROTOCOL ')) throw e;
      assert.fail('PROTOCOL '+label+' FETCH_ERROR '+String(e.cause?.code || e.name || e.message).slice(0,150));
    }
  });
}
