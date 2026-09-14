import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isUserHomePath } from '../site-shell-worker.js';

test('home simplicity targets user home roots but excludes EKODI main and church',()=>{
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

test('shared user shell has progressive disclosure with accessible reveal control',async()=>{
  const [injector,shellSource,cssSource]=await Promise.all([
    readFile(new URL('../ekodi-shell-injector.js',import.meta.url),'utf8'),
    readFile(new URL('../shell/shell.js',import.meta.url),'utf8'),
    readFile(new URL('../shell/user-ui-shell.css',import.meta.url),'utf8'),
  ]);
  assert.match(injector,/data-ekodi-home-simplicity/);
  assert.match(injector,/cleanServiceId\(serviceId\)!=='church'/);
  assert.match(shellSource,/scheduleHomeSimplicity/);
  assert.match(shellSource,/canonicalServiceHomeCurrent/);
  assert.match(shellSource,/aria-expanded/);
  assert.match(shellSource,/hashchange/);
  assert.match(cssSource,/ekodi-home-secondary/);
  assert.match(cssSource,/ekodi-home-more__button:focus-visible/);
});
