import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_DISRUPTIVE_EXECUTION_ORDER,
  planNonDisruptiveRemoteWork,
  validateBackgroundBrowserWorker,
  validateIsolatedDesktopSession,
} from '../non-disruptive-remote-execution.js';

const native = {
  state:'online',
  capabilities:{ backgroundBrowser:true, isolatedDesktop:true },
};

test('execution order protects the user foreground by preferring API and background work', () => {
  assert.deepEqual(NON_DISRUPTIVE_EXECUTION_ORDER, [
    'official-api','background-browser','isolated-desktop','foreground-takeover',
  ]);
  const plan = planNonDisruptiveRemoteWork({
    api:{ available:true, authorized:true, providerId:'drive-api' },
    native,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'official-api');
  assert.equal(plan.requiresForeground, false);
  assert.equal(plan.userForegroundProtected, true);
});

test('background browser must use a dedicated isolated profile', () => {
  const invalid = validateBackgroundBrowserWorker({
    state:'online', verified:true, dedicatedAutomationProfile:true,
    focusIsolated:true, offscreenOrHeadless:true,
    profileId:'Default', activeUserProfileId:'Default',
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes('active_user_profile_reuse_forbidden'));

  const valid = validateBackgroundBrowserWorker({
    state:'online', verified:true, dedicatedAutomationProfile:true,
    focusIsolated:true, offscreenOrHeadless:true,
    clipboardShared:false, userInputInjection:false,
    profileId:'EKODI-Automation', activeUserProfileId:'Default',
  });
  assert.equal(valid.ok, true);
});

test('browser work routes to background browser without taking foreground focus', () => {
  const plan = planNonDisruptiveRemoteWork({
    taskKind:'browser',
    native,
    backgroundBrowser:{
      state:'online', verified:true, dedicatedAutomationProfile:true,
      focusIsolated:true, offscreenOrHeadless:true,
      clipboardShared:false, userInputInjection:false,
      profileId:'EKODI-Automation', activeUserProfileId:'Default',
    },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'background-browser');
  assert.equal(plan.requiresForeground, false);
  assert.equal(plan.candidate.operation, 'computer.browser.execute');
});

test('isolated desktop is the fallback when a background browser is unavailable', () => {
  const plan = planNonDisruptiveRemoteWork({
    taskKind:'browser',
    native,
    backgroundBrowser:{ state:'offline' },
    isolatedDesktop:{
      state:'online', verified:true, sessionType:'windows-secondary-session',
      focusIsolated:true, sharedInteractiveDesktop:false, userInputInjection:false,
    },
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'isolated-desktop');
  assert.equal(plan.requiresForeground, false);
  assert.equal(plan.candidate.operation, 'computer.desktop.session.execute');
});

test('shared interactive desktop is never treated as an isolated desktop', () => {
  const check = validateIsolatedDesktopSession({
    state:'online', verified:true, sessionType:'windows-secondary-session',
    focusIsolated:true, sharedInteractiveDesktop:true,
  });
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('shared_interactive_desktop_forbidden'));
});

test('foreground takeover cannot become an automatic fallback', () => {
  const blocked = planNonDisruptiveRemoteWork({
    foregroundTakeoverRequested:true,
    localConsent:false,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.mode, 'blocked');

  const consented = planNonDisruptiveRemoteWork({
    foregroundTakeoverRequested:true,
    localConsent:true,
  });
  assert.equal(consented.ok, false);
  assert.equal(consented.mode, 'foreground-takeover');
  assert.equal(consented.reason, 'explicit_takeover_requires_separate_privileged_gate');
});
