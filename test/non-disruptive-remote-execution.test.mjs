import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_DISRUPTIVE_EXECUTION_ORDER,
  AUTOMATION_SURFACE_LIFECYCLE,
  API_ONLY_OBSERVATION_TASKS,
  planNonDisruptiveRemoteWork,
  validateBackgroundBrowserWorker,
  validateIsolatedDesktopSession,
} from '../non-disruptive-remote-execution.js';

const native = {
  state:'online',
  serviceReady:true,
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
  assert.equal(plan.cleanupOwnedSurface, true);
  assert.deepEqual(plan.automationSurfaceLifecycle, AUTOMATION_SURFACE_LIFECYCLE);
  assert.equal(AUTOMATION_SURFACE_LIFECYCLE.defaultMode, 'background-only');
  assert.equal(AUTOMATION_SURFACE_LIFECYCLE.createUserBrowserTab, false);
  assert.equal(AUTOMATION_SURFACE_LIFECYCLE.closeOwnedSurfaceOnComplete, true);
  assert.equal(AUTOMATION_SURFACE_LIFECYCLE.preserveUserOwnedSurfaces, true);
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
    userBrowserTabCreation:false, foregroundWindowAllowed:false,
    ownedSurfaceAutoClose:true, preserveUserOwnedSurfaces:true,
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
      userBrowserTabCreation:false, foregroundWindowAllowed:false,
      ownedSurfaceAutoClose:true, preserveUserOwnedSurfaces:true,
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
  assert.ok(check.errors.includes('shared_interactive_desktop_must_be_disabled'));
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


test('API auth requirement is recorded and terminated without opening a user login tab', () => {
  const plan = planNonDisruptiveRemoteWork({
    api:{ available:true, authorized:false, authRequired:true, providerId:'control-api' },
    native,
    foregroundTakeoverRequested:false,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.mode, 'blocked');
  assert.equal(plan.code, 'AUTH_REQUIRED');
  assert.equal(plan.reason, 'auth_required_background_terminated');
  assert.equal(plan.requiresForeground, false);
  assert.equal(plan.cleanupOwnedSurface, true);
  assert.equal(plan.automationSurfaceLifecycle.closeOwnedSurfaceOnAuthRequired, true);
  assert.equal(plan.automationSurfaceLifecycle.createUserBrowserTab, false);
});

test('background worker without explicit no-window and no-tab proof fails closed', () => {
  const incomplete = validateBackgroundBrowserWorker({
    state:'online', verified:true, dedicatedAutomationProfile:true,
    focusIsolated:true, offscreenOrHeadless:true,
    profileId:'EKODI-Automation', activeUserProfileId:'Default',
  });
  assert.equal(incomplete.ok, false);
  for (const required of [
    'shared_clipboard_must_be_disabled',
    'user_input_injection_must_be_disabled',
    'user_browser_tab_creation_must_be_disabled',
    'foreground_window_must_be_disabled',
    'owned_surface_cleanup_must_be_enabled',
    'preserve_user_surfaces_required',
  ]) assert.ok(incomplete.errors.includes(required), required);
  assert.equal(validateIsolatedDesktopSession({
    state:'online', verified:true, sessionType:'vm', focusIsolated:true,
  }).ok, false);
});

test('GitHub Actions/CI/deploy observation never falls back to a browser or desktop', () => {
  for (const taskKind of API_ONLY_OBSERVATION_TASKS) {
    const blocked = planNonDisruptiveRemoteWork({
      taskKind,
      native,
      backgroundBrowser:{
        state:'online', verified:true, dedicatedAutomationProfile:true,
        focusIsolated:true, offscreenOrHeadless:true,
        clipboardShared:false, userInputInjection:false,
        userBrowserTabCreation:false, foregroundWindowAllowed:false,
        ownedSurfaceAutoClose:true, preserveUserOwnedSurfaces:true,
        profileId:'EKODI-Automation', activeUserProfileId:'Default',
      },
      isolatedDesktop:{
        state:'online', verified:true, sessionType:'vm', focusIsolated:true,
        sharedInteractiveDesktop:false, userInputInjection:false,
      },
      foregroundTakeoverRequested:true,
      localConsent:true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.mode, 'blocked');
    assert.equal(blocked.code, 'API_REQUIRED');
    assert.equal(blocked.requiresForeground, false);

    const api = planNonDisruptiveRemoteWork({
      taskKind, api:{available:true,authorized:true,providerId:'github-api'}, native,
    });
    assert.equal(api.ok, true);
    assert.equal(api.mode, 'official-api');
    assert.equal(api.requiresForeground, false);
  }
});
