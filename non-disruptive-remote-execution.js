import { planRemoteComputerExecution } from './remote-computer-provider.js';

export const NON_DISRUPTIVE_EXECUTION_ORDER = Object.freeze([
  'official-api',
  'background-browser',
  'isolated-desktop',
  'foreground-takeover',
]);

const safeText = (value, max = 120) => String(value ?? '').trim().slice(0, max);

export function validateBackgroundBrowserWorker(worker = {}) {
  const errors = [];
  if (worker.state !== 'online') errors.push('worker_offline');
  if (worker.verified !== true) errors.push('worker_not_verified');
  if (worker.dedicatedAutomationProfile !== true) errors.push('dedicated_profile_required');
  if (worker.focusIsolated !== true) errors.push('focus_isolation_required');
  if (worker.offscreenOrHeadless !== true) errors.push('offscreen_or_headless_required');
  if (worker.clipboardShared === true) errors.push('shared_clipboard_forbidden');
  if (worker.userInputInjection === true) errors.push('user_input_injection_forbidden');
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
  if (session.sharedInteractiveDesktop === true) errors.push('shared_interactive_desktop_forbidden');
  if (session.userInputInjection === true) errors.push('user_input_injection_forbidden');
  return Object.freeze({ ok: errors.length === 0, errors });
}

function frozenPlan(payload) {
  return Object.freeze({
    userForegroundProtected: true,
    sameBrowserProfileForbidden: true,
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
  if (api?.available === true && api?.authorized === true && api?.securityEquivalent !== false) {
    return frozenPlan({
      ok: true,
      mode: 'official-api',
      reason: 'api_preferred',
      requiresForeground: false,
      candidate: Object.freeze({ providerId: safeText(api.providerId || 'official-api'), kind: 'api' }),
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
