import test from 'node:test';
import assert from 'node:assert/strict';
import { injectTaxLocalFallback } from '../tax-local-fallback.js';

test('Tax portal injects browser-local supplier fallback before bootstrap', async () => {
  const source = "const JS=`seed`;\nloadAll();\n})();";
  const response = await injectTaxLocalFallback(new Response(source, {
    headers: { 'content-type': 'text/javascript; charset=utf-8' },
  }));
  const body = await response.text();
  assert.match(body, /ekodi-tax-local-suppliers-v1/);
  assert.match(body, /localStorage\.setItem/);
  assert.match(body, /syncLocalSuppliers/);
  assert.match(body, /D1 연결이 없어 공급자 정보를 이 브라우저에 임시 저장했습니다/);
  assert.ok(body.indexOf('ekodi-tax-local-suppliers-v1') < body.lastIndexOf('loadAll();'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-ekodi-tax-local-fallback'), 'v1');
});

test('Tax local fallback injection is idempotent', async () => {
  const source = "const LOCAL_SUPPLIER_KEY='ekodi-tax-local-suppliers-v1';\nloadAll();\n})();";
  const response = await injectTaxLocalFallback(new Response(source));
  const body = await response.text();
  assert.equal(body, source);
});
