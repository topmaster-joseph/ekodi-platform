import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../sites/seonammedi/public/app.css',import.meta.url),'utf8');
const js=await readFile(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');
const block=css.slice(css.indexOf('ORG-COMPACT-001'));

test('committees stay on one horizontal line at every width and scale with the chart width',()=>{
  assert.ok(block.length>100,'compact rules live in the external stylesheet (inline styles are CSP-blocked)');
  assert.match(block,/\.organization-chart\{container-type:inline-size/);
  assert.match(block,/\.org-committees,\.org-committees\[class\]\{display:grid;grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax\(0,1fr\)/);
  assert.match(block,/\.org-committee strong\{font-size:clamp\([^)]*cqi[^)]*\)/);
  assert.doesNotMatch(block,/\.org-committees\{grid-template-columns:1fr\}/);
});

test('long committee names break only before 위원회',()=>{
  assert.match(js,/escapeHtml\(item\.name\)\.replace\(\/\(\.\)\(위원회\)\$\/,'\$1<wbr>\$2'\)/);
});

test('phone layout trims gutters and keeps footer text full width beside the 관리 button',()=>{
  const phone=block.slice(block.indexOf('@media(max-width:760px)'));
  assert.match(phone,/main\.seonam-visual-layout\{width:calc\(100% - 8px\)!important/);
  assert.match(phone,/footer\.site-footer\{display:grid!important;grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(phone,/footer\.site-footer \.site-footer-copy\{display:contents/);
  assert.match(phone,/footer\.site-footer>a\{grid-column:2;grid-row:1/);
  assert.match(phone,/footer\.site-footer \.site-footer-copy span\{grid-column:1\/-1/);
  let depth=0;for(const c of css){if(c==='{')depth++;if(c==='}')depth--;assert.ok(depth>=0)}assert.equal(depth,0,'balanced braces');
});
