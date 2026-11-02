import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const status=await readFile(new URL('../church-online-status.js',import.meta.url),'utf8');
const styles=await readFile(new URL('../church-live-entry.css',import.meta.url),'utf8');

test('language control hides the visible Language chrome and remains accessible',()=>{
  assert.match(status,/querySelector\('\.ekodi-user-language__icon'\)\?\.remove\(\)/);
  assert.match(status,/querySelector\('\.ekodi-user-language__label'\)\?\.remove\(\)/);
  assert.match(status,/setAttribute\('aria-label','언어 선택'\)/);
  assert.match(styles,/\.ekodi-user-language__icon,\.site-header \.ekodi-user-language__label\{display:none!important\}/);
  assert.match(styles,/\.ekodi-user-language__select\{[^}]*border-radius:999px!important/s);
});

test('My EKODI routes through central auth and returns to the requested page',()=>{
  assert.match(status,/new URL\('\/auth\/',location\.origin\)/);
  assert.match(status,/login\.searchParams\.set\('site','church'\)/);
  assert.match(status,/login\.searchParams\.set\('return_to',destination\)/);
  assert.match(status,/link\.href=login\.toString\(\)/);
});

test('church delegates media to EKODI Live without modal or camera iframe',()=>{
  assert.match(status,/const baseJoin='\/live\/church\/'/);
  assert.match(status,/tenant=ekodichurch/);
  assert.doesNotMatch(status,/churchLiveDialog|openIntegratedLive|wireIntegratedLive|<iframe/);
  assert.doesNotMatch(styles,/\.church-live-dialog/);
});
