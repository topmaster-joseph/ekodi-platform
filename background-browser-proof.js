import { validateRemoteComputerReceipt } from './remote-computer-provider.js';

const BLOCKED = Object.freeze({ ok:false, outcome:'invalid', code:'BACKGROUND_BROWSER_PROOF_INVALID' });
const AUTH_REQUIRED = Object.freeze({ ok:false, outcome:'auth_required', code:'AUTH_REQUIRED' });
const VERIFIED = Object.freeze({ ok:true, outcome:'verified', code:'BACKGROUND_BROWSER_PROOF_VERIFIED' });
const sha256 = value => /^[a-f0-9]{64}$/i.test(String(value ?? ''));

/**
 * Accept a claimed native browser result only after its authenticated device
 * command is tied to a full, cleaned-up, isolated, read-only receipt.
 * This guards BOTH Device Control and Hybrid Execution completion paths.
 * An ordinary agent's `success:true` flag is never sufficient.
 */
export function assessBackgroundBrowserReceipt({ result, requestId, deviceId } = {}) {
  const proof = result && typeof result === 'object' && !Array.isArray(result)
    ? result.browserWorker : null;
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return BLOCKED;

  const validation = validateRemoteComputerReceipt({
    requestId, deviceId, operation:'computer.browser.execute', status:'ok',
    executionMode:proof.executionMode,
    userBrowserTabCreated:proof.createUserBrowserTab,
    ownedSurfaceClosed:proof.ownedAutomationSurfaceAutoClosed,
    userOwnedSurfacesPreserved:proof.userOwnedSurfacesPreserved,
    interactiveLoginOpened:proof.interactiveLoginOpened,
    foregroundFocusStolen:proof.focusIsolated === true ? false : undefined,
    activeUserBrowserProfileReused:proof.activeUserProfileReused,
  });

  // Fail closed when any mandatory negative evidence is absent, not just true.
  if (!validation.ok ||
      proof.mode !== 'background-browser-worker' ||
      proof.virtualizationProvider !== 'ekodi-native-remote-computer' ||
      proof.routingPolicy !== 'EKODI-VIRTUALIZATION-ROUTING-001' ||
      proof.browserProcessClosed !== true ||
      proof.profileRemoved !== true ||
      proof.temporaryProfileRemoved !== true ||
      proof.screenshotArtifactRemoved !== true) return BLOCKED;

  if (proof.authRequired === true) {
    // Authentication must terminate without interactive login or retry.
    return proof.ok === false && proof.code === 'AUTH_REQUIRED'
      ? AUTH_REQUIRED : BLOCKED;
  }

  if (proof.authRequired !== false ||
      proof.ok !== true ||
      proof.dedicatedAutomationProfile !== true ||
      proof.ephemeralProfile !== true ||
      proof.offscreenOrHeadless !== true ||
      proof.clipboardShared !== false ||
      proof.userInputInjection !== false ||
      proof.javascriptEnabled !== false ||
      proof.mutationMode !== 'read-only-static-surface' ||
      proof.httpMethod !== 'GET' ||
      !Number.isSafeInteger(proof.contentBytes) || proof.contentBytes <= 0 ||
      !Number.isSafeInteger(proof.screenshotBytes) || proof.screenshotBytes <= 0 ||
      !sha256(proof.contentSha256) || !sha256(proof.screenshotSha256) ||
      proof.browserProcessIdObserved !== true ||
      !Number.isSafeInteger(proof.ownedTabsObserved) || proof.ownedTabsObserved < 1 ||
      proof.ownedTabsClosed !== proof.ownedTabsObserved) return BLOCKED;

  return VERIFIED;
}
