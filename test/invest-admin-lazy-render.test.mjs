import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const investAdmin = await readFile(new URL('../invest-admin.js', import.meta.url), 'utf8');
const menuLayout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('Invest lazy install renders meaningful panel content before the shared layout activates it', () => {
  assert.match(menuLayout, /section==='invest'.*import\('\.\/invest-admin\.js'\).*activatePanel\(section\)/s);
  const install = investAdmin.match(/function install\(\)\{([\s\S]*?)\n\}\ninstall\(\)/)?.[1] || '';
  assert.match(install, /#investAdminPanel/);
  assert.match(install, /render\(\);/);
  assert.ok(install.indexOf('render();') < install.indexOf("window.dispatchEvent(new CustomEvent('ekodi-nav-changed'"), 'Invest content must exist before navigation synchronization');
});

test('Invest panel still renders its safety and specialized-site controls', () => {
  assert.match(investAdmin, /투자 AI 운영관리/);
  assert.match(investAdmin, /SPECIALIZED SITES/);
  assert.match(investAdmin, /IMMUTABLE SAFETY/);
  assert.match(investAdmin, /실거래 기본 잠금/);
  assert.match(investAdmin, /INVESTMENT LIFECYCLE/);
  assert.match(investAdmin, /\/invest\/opportunities/);
  assert.match(investAdmin, /\/invest\/diligence/);
  assert.match(investAdmin, /\/invest\/matching/);
  assert.match(investAdmin, /\/invest\/aftercare/);
  assert.match(investAdmin, /사람 최종결정/);
});
