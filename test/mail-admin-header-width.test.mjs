import test from 'node:test';
import assert from 'node:assert/strict';
import { mailAdminPage } from '../mail-admin-page.js';

test('mail admin header and main share exactly one centered width contract', async()=>{
  const response=mailAdminPage();
  const html=await response.text();
  assert.match(html,/\.ma\{--mail-admin-column-width:880px;/);
  assert.match(html,/\.ma \.top\{[^}]*width:100%;max-width:var\(--mail-admin-column-width\);margin-inline:auto;/);
  assert.match(html,/\.ma \.wrap\{[^}]*width:100%;max-width:var\(--mail-admin-column-width\);margin-inline:auto;/);
  assert.match(html,/<header class="top">[\s\S]*?<main class="wrap">/);
  assert.match(html,/<button type="button" class="switch" id="switchAccount"/);
  assert.match(html,/class="top"[^>]*><strong>EKODI Mail<\/strong>/);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('header stays compact at 320px and does not change account tab behavior', async()=>{
  const html=await mailAdminPage().text();
  assert.match(html,/@media\(max-width:380px\)\{\.ma \.top\{gap:6px\}/);
  assert.match(html,/\.ma \.top span\{display:none\}/);
  assert.match(html,/\.ma \.top a,\.ma \.top \.switch\{padding:7px 8px;font-size:12px\}/);
  assert.match(html,/\.ma \.top\{[^}]*flex-wrap:wrap/);
  assert.match(html,/data-tab="accounts"/);
  assert.match(html,/data-tab="setup"/);
});
