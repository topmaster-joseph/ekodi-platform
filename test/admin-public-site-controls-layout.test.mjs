import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../admin-public-site-controls.js', import.meta.url), 'utf8');

test('site publication admin redesign remains parseable and uses existing API', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /const API = 'https:\/\/ekodi\.kr\/api\/control\/public-sites'/);
  assert.match(source, /credentials: 'omit'/);
  assert.match(source, /data-psc-form/);
  assert.match(source, /method:'PUT'/);
  assert.match(source, /encodeURIComponent\(site\.id\)/);
  for(const field of ['publicStatus','maintenanceDisplayType','maintenanceTitle','maintenanceMessage','maintenanceRedirectUrl','redirectMode']){
    assert.match(source, new RegExp(field));
  }
});

test('site list offers summary, search, filter, selection and separate editor', () => {
  for(const marker of ['data-psc-metrics','data-psc-search','data-psc-filter','data-psc-list','data-psc-select','data-psc-editor','data-psc-save']) {
    assert.ok(source.includes(marker),marker);
  }
  assert.match(source, /grid-template-columns:minmax\(260px,0\.88fr\) minmax\(370px,1\.35fr\)/);
  assert.match(source, /@media\(max-width:900px\)/);
  assert.match(source, /@media\(max-width:760px\)/);
  assert.match(source, /\.psc-button,#publicSiteControlsPanel \.psc-row,#publicSiteControlsPanel \.psc-metric\{min-height:44px\}/);
  assert.match(source, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(source, /data-maintenance-options/);
  assert.match(source, /role="status" aria-live="polite"/);
});

test('selection is reversible, publication changes prompt and untrusted names are escaped', () => {
  assert.match(source, /function confirmDiscard\(/);
  assert.match(source, /window\.confirm\('저장하지 않은 변경사항이 있습니다/);
  assert.match(source, /payload\.publicStatus !== saved\.publicStatus/);
  assert.match(source, /function escapeHtml\(/);
  assert.match(source, /escapeHtml\(site\.name/);
  assert.match(source, /escapeHtml\(info\.label\)/);
  assert.match(source, /function safeSiteUrl\(/);
  assert.match(source, /url\.protocol === 'https:'/);
  assert.match(source, /viewState\.dirty = JSON\.stringify\(payloadFromForm\(form\)\)/);
});

test('other admin features in the shared asset remain present', () => {
  assert.match(source, /const SECTION = 'auth-providers'/);
  assert.match(source, /window\.EKODIAuthProviderControl/);
  assert.match(source, /window\.EKODIPublicSiteControls/);
});

test('refresh and site transitions never silently overwrite unsaved publication changes', () => {
  assert.match(source, /if \(viewState\.dirty && !allowDiscard\)/);
  assert.match(source, /load\(\{allowDiscard:true\}\)/);
  assert.match(source, /viewState\.loading\) return;/);
  assert.match(source, /!button\.dataset\.pscSelect \|\| button\.dataset\.pscSelect === viewState\.selectedId \|\| viewState\.loading/);
  assert.match(source, /if \(viewState\.loading\) return;renderEditor\(panel\)/);
});
