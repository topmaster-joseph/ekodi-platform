// Dedicated, deliberately bounded Google Workspace audio insertion pilot.
// Never import generic host/URL permission from the EKODI browser-only worker.
export const SLIDES_AUDIO_PRESENTATION_ID = '1wJhndsrFK7GrwnJsmWMvarivlNCfgTE97RGQTRJ3CfI';
export const SLIDES_AUDIO_OPERATION = 'insert-native-audio';
export const SLIDES_AUDIO_ITEMS = Object.freeze([
  Object.freeze({ slideId:'ekodi_title_practice_ja', slideNumber:22, fileId:'1mfaB54Kzi14jT7yq9rVi2M4G71jibxXT', name:'sermon_ja.mp3' }),
  Object.freeze({ slideId:'ekodi_title_practice_vi', slideNumber:23, fileId:'1m3TAaHADSkHybvUMp93q5zk2sv6w066U', name:'sermon_vi.mp3' }),
  Object.freeze({ slideId:'ekodi_title_practice_my', slideNumber:24, fileId:'1tTPvJwJpGte8oRYlAj6rcFq3L8pDoxv_', name:'sermon_my.mp3' }),
  Object.freeze({ slideId:'g40a0517f20d_1_130', slideNumber:38, fileId:'1VvUZIT_egYbrLOVa7I7H3RCtKQVzxPWk', name:'prayer_ko.mp3' }),
  Object.freeze({ slideId:'g40a0517f20d_1_146', slideNumber:39, fileId:'1ZwaNkYTYsXZvN9ayL_rpo3x_TlYntveJ', name:'prayer_en.mp3' }),
  Object.freeze({ slideId:'g40a0517f20d_1_134', slideNumber:40, fileId:'1VDcSW1-6vBvttvPoX-PSWKH49VBXwfdj', name:'prayer_zh.mp3' }),
  Object.freeze({ slideId:'g40a0517f20d_1_138', slideNumber:41, fileId:'1-6oyk9Ns6eT7mnKuMLhu2n_R8l_dnkpx', name:'prayer_ja.mp3' }),
  Object.freeze({ slideId:'g40a0517f20d_1_142', slideNumber:42, fileId:'1dyNFS1oLdHppNMyZtL0kY8wNp0mDGAl3', name:'prayer_vi.mp3' }),
]);
const OWN_KEYS = new Set(['presentationId','operation','pilotId']);
const id = value => String(value ?? '').trim();
export const SLIDES_AUDIO_PILOT_ID = '261011-ekodi-sunday-service-8-mp3';

// Never accept arbitrary host, path, Drive ID, replacement mappings or browser flags
// in requests, even from an administrator. The server is the source of truth.
export function normalizeSlidesAudioPilot(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('GOOGLE_WORKSPACE_PILOT_PAYLOAD_INVALID');
  if (Object.keys(input).some(key => !OWN_KEYS.has(key))) throw new Error('GOOGLE_WORKSPACE_PILOT_SCOPE_DENIED');
  if (id(input.presentationId) !== SLIDES_AUDIO_PRESENTATION_ID ||
      input.operation !== SLIDES_AUDIO_OPERATION ||
      input.pilotId !== SLIDES_AUDIO_PILOT_ID) throw new Error('GOOGLE_WORKSPACE_PILOT_SCOPE_DENIED');
  return Object.freeze({
    pilotId:SLIDES_AUDIO_PILOT_ID,
    presentationId:SLIDES_AUDIO_PRESENTATION_ID,
    operation:SLIDES_AUDIO_OPERATION,
    source:'ekodi-orchestrator-fixed-scope',
    executionMode:'dedicated-headless-browser',
    consentGate:'separate-google-oauth-consent',
    interactiveLoginAllowed:false,
    foregroundTakeoverAllowed:false,
    reuseActiveUserBrowserProfile:false,
    preserveUserOwnedSurfaces:true,
    maxAttempts:1,
    items:SLIDES_AUDIO_ITEMS.map(x => ({ ...x })),
  });
}

// Job admission only accepts the three public fields above. The database holds
// their server-expanded canonical scope; reclaim must verify the FULL stored
// scope rather than mistakenly treating it as a new API request.
function exactJsonStructure(a,b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left=Object.keys(a), right=Object.keys(b);
  if (left.length !== right.length) return false;
  return left.every(key => Object.prototype.hasOwnProperty.call(b,key) && exactJsonStructure(a[key],b[key]));
}
export function restoreStoredSlidesAudioPilot(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('GOOGLE_WORKSPACE_STORED_PAYLOAD_INVALID');
  }
  const canonical=normalizeSlidesAudioPilot({
    presentationId:stored.presentationId, operation:stored.operation, pilotId:stored.pilotId,
  });
  if (!exactJsonStructure(stored,canonical)) throw new Error('GOOGLE_WORKSPACE_STORED_PAYLOAD_TAMPERED');
  return canonical;
}

// Results are acceptance evidence only if a dedicated-profile browser actually
// reports the native audio control and playable media for each exact slide/ID.
// A hyperlink, URL preview or copied text is NOT equivalent to embedded audio.
export function validateSlidesAudioPilotReceipt(report, expected = SLIDES_AUDIO_ITEMS) {
  const fail = reason => Object.freeze({ ok:false, reason });
  if (!report || report.status !== 'completed') return fail('operation_not_completed');
  if (report.presentationId !== SLIDES_AUDIO_PRESENTATION_ID) return fail('presentation_mismatch');
  if (report.dedicatedProfileVerified !== true ||
      report.foregroundFocusStolen !== false ||
      report.activeUserProfileReused !== false ||
      report.interactiveLoginOpened !== false) return fail('isolation_or_consent_unverified');
  if (!Array.isArray(report.items) || report.items.length !== expected.length) return fail('receipt_count_mismatch');
  const seen = new Set();
  for (const item of report.items) {
    if (!item || seen.has(item.slideId)) return fail('receipt_duplicate_slide');
    seen.add(item.slideId);
    const target = expected.find(x => x.slideId === item.slideId);
    if (!target || target.fileId !== item.fileId ||
        item.nativeAudioControlObserved !== true ||
        item.playbackVerified !== true ||
        item.hyperlinkOnly === true) return fail('native_audio_verification_incomplete');
  }
  return Object.freeze({ok:true, verifiedItems:seen.size});
}

export const SLIDES_AUDIO_SECURITY = Object.freeze({
  allowedWebOrigins:Object.freeze(['https://docs.google.com','https://drive.google.com','https://accounts.google.com']),
  allowedGoogleWorkspaceApp:'slides',
  allowDriveUpload:false,
  allowAnyGoogleWorkspaceEdit:false,
  allowGenericExternalBrowsing:false,
  allowUserBrowserProfile:false,
  allowCredentialCollection:false,
  authenticatedProfileOwnerConsentRequired:true,
  canaryBeforePromotionRequired:true,
  failClosedWhenRuntimeMissing:true,
});
