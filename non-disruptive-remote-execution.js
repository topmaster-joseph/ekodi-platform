import { planRemoteComputerExecution } from './remote-computer-provider.js';

export const NON_DISRUPTIVE_EXECUTION_ORDER = Object.freeze([
  'official-api',
  'background-browser',
  'isolated-desktop',
  'foreground-takeover',
]);

export const AUTOMATION_SURFACE_LIFECYCLE = Object.freeze({
  defaultMode: 'background-only',
  createUserBrowserTab: false,
  closeOwnedSurfaceOnComplete: true,
  closeOwnedSurfaceOnAuthRequired: true,
  preserveUserOwnedSurfaces: true,
  foregroundFallbackAutomatic: false,
});

// Machine-readable CI and GitHub Actions status must never be inspected by
// launching a desktop or browser surface as an automatic fallback.
export const API_ONLY_OBSERVATION_TASKS = Object.freeze([
  'github-actions-status',
  'github-actions-logs',
  'github-pr-status',
  'ci-status',
  'deployment-status',
]);

const safeText = (value, max = 120) => String(value ?? '').trim().slice(0, max);

export function validateBackgroundBrowserWorker(worker = {}) {
  const errors = [];
  if (worker.state !== 'online') errors.push('worker_offline');
  if (worker.verified !== true) errors.push('worker_not_verified');
  if (worker.dedicatedAutomationProfile !== true) errors.push('dedicated_profile_required');
  if (worker.focusIsolated !== true) errors.push('focus_isolation_required');
  if (worker.offscreenOrHeadless !== true) errors.push('offscreen_or_headless_required');
  if (worker.clipboardShared !== false) errors.push('shared_clipboard_must_be_disabled');
  if (worker.userInputInjection !== false) errors.push('user_input_injection_must_be_disabled');
  if (worker.userBrowserTabCreation !== false) errors.push('user_browser_tab_creation_must_be_disabled');
  if (worker.foregroundWindowAllowed !== false) errors.push('foreground_window_must_be_disabled');
  if (worker.ownedSurfaceAutoClose !== true) errors.push('owned_surface_cleanup_must_be_enabled');
  if (worker.preserveUserOwnedSurfaces !== true) errors.push('preserve_user_surfaces_required');
  const profileId = safeText(worker.profileId);
  const activeUserProfileId = safeText(worker.activeUserProfileId);
  if (profileId && activeUserProfileId && profileId === activeUserProfileId) errors.push('active_user_profile_reuse_forbidden');
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function validateIsolatedDesktopSession(session = {}) {
  const errors = [];
  if (session.state !== 'online') errors.push('session_offline');
  if (session.verified !== true) errors.push('session_not_verified');
  if (!['windows-secondary-session','vm','sandbox'].includes(session.sessionType)) errors.push('unsupported_session_type');
  if (session.focusIsolated !== true) errors.push('focus_isolation_required');
  if (session.sharedInteractiveDesktop !== false) errors.push('shared_interactive_desktop_must_be_disabled');
  if (session.userInputInjection !== false) errors.push('user_input_injection_must_be_disabled');
  return Object.freeze({ ok: errors.length === 0, errors });
}

function frozenPlan(payload) {
  return Object.freeze({
    userForegroundProtected: true,
    sameBrowserProfileForbidden: true,
    automationSurfaceLifecycle: AUTOMATION_SURFACE_LIFECYCLE,
    ...payload,
  });
}

export function planNonDisruptiveRemoteWork({
  taskKind = 'browser',
  api = null,
  native = null,
  externalProviders = [],
  backgroundBrowser = null,
  isolatedDesktop = null,
  foregroundTakeoverRequested = false,
  localConsent = false,
} = {}) {
  if (api?.available === true && api?.authRequired === true) {
    return frozenPlan({
      ok: false,
      mode: 'blocked',
      reason: 'auth_required_background_terminated',
      code: 'AUTH_REQUIRED',
      requiresForeground: false,
      cleanupOwnedSurface: true,
    });
  }

  if (api?.available === true && api?.authorized === true && api?.securityEquivalent !== false) {
    return frozenPlan({
      ok: true,
      mode: 'official-api',
      reason: 'api_preferred',
      requiresForeground: false,
      candidate: Object.freeze({ providerId: safeText(api.providerId || 'official-api'), kind: 'api' }),
      cleanupOwnedSurface: true,
    });
  }

  // Missing API credentials or an outage never permits an interactive
  // GitHub/CI/deploy log tab to be opened as a substitute.
  if (API_ONLY_OBSERVATION_TASKS.includes(taskKind)) {
    return frozenPlan({
      ok: false,
      mode: 'blocked',
      reason: 'authorized_api_required_for_background_observation',
      code: 'API_REQUIRED',
      requiresForeground: false,
      cleanupOwnedSurface: true,
    });
  }

  if (taskKind === 'browser') {
    const browserCheck = validateBackgroundBrowserWorker(backgroundBrowser || {});
    if (browserCheck.ok) {
      const browserPlan = planRemoteComputerExecution({
        operation: 'computer.browser.execute',
        native,
        externalProviders,
        isolatedExecutorVerified: true,
      });
      if (browserPlan.ok) {
        return frozenPlan({
          ok: true,
          mode: 'background-browser',
          reason: 'dedicated_background_browser_ready',
          requiresForeground: false,
          candidate: browserPlan.candidates[0],
          cleanupOwnedSurface: true,
        });
      }
    }
  }

  const desktopCheck = validateIsolatedDesktopSession(isolatedDesktop || {});
  if (desktopCheck.ok) {
    const desktopPlan = planRemoteComputerExecution({
      operation: 'computer.desktop.session.execute',
      native,
      externalProviders,
      isolatedExecutorVerified: true,
    });
    if (desktopPlan.ok) {
      return frozenPlan({
        ok: true,
        mode: 'isolated-desktop',
        reason: 'isolated_desktop_ready',
        requiresForeground: false,
        candidate: desktopPlan.candidates[0],
        cleanupOwnedSurface: true,
      });
    }
  }

  if (foregroundTakeoverRequested === true && localConsent === true) {
    return frozenPlan({
      ok: false,
      mode: 'foreground-takeover',
      reason: 'explicit_takeover_requires_separate_privileged_gate',
      requiresForeground: true,
      requiresLocalConsent: true,
    });
  }

  return frozenPlan({
    ok: false,
    mode: 'blocked',
    reason: 'no_non_disruptive_executor_ready',
    requiresForeground: false,
  });
}
