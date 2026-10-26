import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('server shell preserves native site footers and renders site-specific fallback only when missing',async()=>{
  const injector=await read('ekodi-shell-injector.js');
  assert.match(injector,/class UserFooterCanonicalizer/);
  assert.match(injector,/const shared=classes\.includes\('ekodi-user-ui-footer'\)/);
  assert.match(injector,/if\(shared&&!serviceOwnsFooter\(this\.serviceId\)\)\{element\.remove\(\);return;\}/);
  assert.match(injector,/if\(sharedFooterReplacesLocalFooter\(this\.serviceId\)\)\{element\.remove\(\);return;\}/);
  assert.match(injector,/SHARED_FOOTER_REPLACES_LOCAL_FOOTER_SERVICES=new Set\(\)/);
  assert.match(injector,/hasNativeFooter=true/);
  assert.match(injector,/element\.onEndTag\(tag=>/);
  assert.match(injector,/this\.footerState\?\.hasNativeFooter/);
  assert.match(injector,/siteChromeDefaults\(serviceLabel\(this\.serviceId\),serviceHomeHref\(this\.serviceId\)\)/);
  assert.match(injector,/tag\.before\(renderEkodiUserFooter\(defaults\.footer\),\{html:true\}\)/);
  assert.match(injector,/\.on\('footer',footerState\)/);
});
