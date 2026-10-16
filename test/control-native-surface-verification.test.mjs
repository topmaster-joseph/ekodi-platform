import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const release = read('.github/workflows/deploy-site-core.yml');
const native = read('.github/workflows/ekodi-background-browser-worker.yml');
const worker = read('site-worker.js');
const html = read('control.html');
const ui = read('control.js');

test('shared-site release must independently probe Control on desktop and mobile', () => {
  const scoped = 'surface_paths: /,/my/,/admin/,/ekodimall/admin,/control';
  assert.equal(release.split(scoped).length - 1, 2);
  const desktop = release.slice(release.indexOf('native_surface_verification_desktop:'), release.indexOf('native_surface_verification_mobile:'));
  const mobile = release.slice(release.indexOf('native_surface_verification_mobile:'), release.indexOf('authenticated_admin_surface_verification:'));
  assert.ok(desktop.includes(scoped));
  assert.ok(mobile.includes(scoped));
  assert.ok(desktop.includes('device_profile: desktop'));
  assert.ok(mobile.includes('device_profile: mobile-portrait'));
  assert.ok(desktop.includes('needs: deploy'));
  assert.ok(mobile.includes('needs: deploy'));
});

test('Control native probes are immutable isolated EKODI browser checks', () => {
  assert.match(native, /allowMutation:false/);
  assert.match(native, /activeUserProfileReused == false/);
  assert.match(native, /hostInputInjection == false/);
  assert.match(native, /\.pageErrors \| length == 0/);
  assert.match(native, /horizontalOverflow == true/);
  assert.match(native, /maxActions=30/);
});

test('Control route and both guarded actions remain available as first-party assets', () => {
  assert.match(worker, /url\.pathname === '\/control'/);
  assert.match(worker, /CONTROL_ASSETS = new Set\(\['\/control\.css','\/control\.js'\]\)/);
  assert.match(html, /id="aiRoutePreview"/);
  assert.match(html, /id="orchestratorRelease"/);
  assert.match(ui, /async function previewAiRoute\(\)/);
  assert.match(ui, /\/api\/control\/ai\/v8\/sovereignty\/preview/);
  assert.match(ui, /\/api\/control\/ai\/v8\/orchestrator\/submit/);
  assert.match(ui, /executionAuthorized!==false/);
  assert.match(ui, /submitted\?\.accepted!==true/);
});
