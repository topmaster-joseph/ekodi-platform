import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isUserHomePath } from '../site-shell-worker.js';

test('home focus targets user and first-level subservice roots but excludes EKODI main and church',()=>{
  assert.equal(isUserHomePath('/', 'ekodi'), false);
  assert.equal(isUserHomePath('/ekodichurch', 'church'), false);
  assert.equal(isUserHomePath('/ekodibiz', 'biz'), true);
  assert.equal(isUserHomePath('/ekodilab', 'lab'), true);
  assert.equal(isUserHomePath('/ekodibiz/trade', 'trade'), true);
  assert.equal(isUserHomePath('/cafe', 'cafe'), true);
  assert.equal(isUserHomePath('/jadam', '', 'jadam'), true);
  assert.equal(isUserHomePath('/cgma', '', 'cgma'), true);
  assert.equal(isUserHomePath('/jadam/marketing', '', 'jadam'), true);
  assert.equal(isUserHomePath('/jadam/marketing/campaign', '', 'jadam'), false);
});

test('shared progressive-home core is reused for workspace and subservice home focus',async()=>{
  const [injector,shell,css]=await Promise.all([
    readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
    readFile(new URL('../shell/shell.js',import.meta.url),'utf8'),
    readFile(new URL('../shell/user-ui-shell.css',import.meta.url),'utf8'),
  ]);
  assert.match(injector,/data-ekodi-home-focus-request/);
  assert.match(injector,/cleanServiceId\(serviceId\)!=='church'/);
  assert.match(shell,/function applyProgressiveHomeFocus/);
  assert.match(shell,/ekodiHomeFocusRequest/);
  assert.match(shell,/ekodiHomeFocusDensity/);
  assert.match(shell,/hashchange/);
  assert.match(shell,/aria-controls/);
  assert.match(css,/data-ekodi-progressive-reveal/);
});
