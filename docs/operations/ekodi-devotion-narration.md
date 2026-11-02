# EKODI daily devotion — governed two-narrator master audio

Task: DEVOTION-EKODI-NARRATION-20261102. Shared rendering: EKODI Church, Mission, and Bible.

## Problem and solution
Android Web Speech API does not provide a standard speaker gender attribute. Some devices present only generically named Korean voices. The previous male/female preference therefore cannot guarantee a gender-identified voice. Modifying pitch does not create a real verified male or female narrator.

The new EKODI mode plays two distinct, independently reviewed Korean MP3s for the same published Scripture day. The OS speech engine remains a functional temporary fallback. If no approved male/female pair exists, the UI truthfully shows '에코디 낭독 · 준비 중' rather than pretending to play something else.

## Approval boundary (2026-11-02)

The EKODI platform operator explicitly authorized the use of **EKODI-owned/licensed voice assets** for public daily devotional narration. This organizational authorization does not independently establish the consent of each identifiable male or female source speaker, nor does it override an older sample's audiobook-only consent. The speaker must opt into the additional **public devotional voice** scope in the protected EKODI Voice Studio, and fresh metadata must contain `devotionConsent=self-recorded-for-ekodi-public-devotion`, its timestamp, and a SHA256 matching the private sample bytes. No client screen or workflow may promote an old sample automatically.

## Controlled production workflow
1. Gather two independently consented Korean reference recordings, one male and one female. Explicit, scope-specific reuse permission is required for voice conversion or public devotional delivery. Private bookstore voice samples are not automatically licensed for public Church devotional reuse.
2. Export the already published daily reading with no token:
   node scripts/ekodi-voice/export-devotion-script.mjs 2026-11-02 private/devotion-script.json
   This uses the same public Bible API and narration segments as the user page and refuses future days. Do not export private drafts.
3. On an authorized offline runner, retrieve both distinct speaker consent JSON metadata files and corresponding private audio samples securely. Run the consent-enforced wrapper before existing MeloTTS + OpenVoice V2 rendering:
   node scripts/ekodi-voice/render-consented-devotion.mjs private/devotion-script.json private/male-meta.json private/male.wav private/female-meta.json private/female.wav private/draft checkpoints_v2
   The wrapper refuses when the two recorded voices lack individually scoped public devotional consent, separate speaker identity, valid private sample object keys or exact SHA256 matches. Do not invoke the lower-level rendering script directly to bypass this guard.
   Both outputs are private drafts. Do not commit source recordings, checkpoints or generated drafts.
4. Independent human review is required for rights, Scripture fidelity, accurate Korean pronunciation, real speaker consent, naturalness, full recording length, listenability and accessibility. The reviewer records approval of the exact text SHA256 and separate speaker consent identifiers. No auto-approval is allowed.
5. After review, run:
   node scripts/ekodi-voice/approve-devotion-narration.mjs 2026-11-02 private/draft private/review.json bible/narration
   This checks both MP3s, distinct hashes, durations and all approved review fields and creates date/male.mp3, date/female.mp3 and date/manifest.json. Only the final approved public media and manifest may be proposed in a guarded PR.
6. EKODI Orchestrator performs protected merge, staging, production and verification. The Bible Worker denies unapproved, missing and future-date audio even via direct asset links.
7. The shared web renderer loads the approved manifest then checks both audio files before enabling '에코디 낭독'. The user can switch male/female recordings, pause, resume, stop, repeat and choose speed. There is no browser-time voice cloning, paid inference, microphone upload or private personal data transfer.

## Acceptance
- Mobile 320/390px and desktop 768/1366/1440px with no clipping or horizontal overflow.
- Same approved pair is available through Bible, Church and Mission only for the correct published day.
- Male and female truly play two separately approved MP3s, not fake voice names or pitch-shift approximations.
- Four-line sharing, biblical text integrity, user roles, login and privacy remain unchanged.
- Audition the finished voices on a real Android handset with human review; a mock voice test is not a substitute.

**As of task creation there is no confirmed, approved two-speaker MP3 pair in this repository.** This code is a safe playback/production pipeline, not a claim that human-quality male and female recordings already exist.

## Unified platform-wide owner voice authorization (2026-11-02)

The EKODI platform operator has expressly authorized the reuse of audio and voice assets **which EKODI actually owns or has the right to license**, for public and private use across all EKODI sites and products. This is a one-time **organizational** grant; do not interrupt the owner to repeat approval for each Church, Mission, Bible, Publishing, educational, or future EKODI service. The canonical scope is recorded in `config/ekodi-voice-reuse-policy.json`.

The same global grant does **not** create rights over a separate natural person's identifiable recorded voice. A genuine voice provider can now opt in **once per recording** to `self-recorded-for-ekodi-all-services` through the authenticated private voice studio. This stores `allServicesConsent` and a timestamp and also marks the existing public devotion consent for compatibility with the fail-closed Bible narrator pipeline. Once consented and source integrity verified, that recording may be reused across EKODI services according to that one grant, without site-level re-approval. Existing narrow/public-devotion grants remain valid within their original scope. Legacy `audiobook_only` sample records remain unchanged.

The November 2 protected R2 audit found male and female samples classified `audiobook_only`. This fact should not be overwritten or backdated merely because the platform owner said 'no more asking.' The approved scope and actual speaker/source rights must be independently matched before voice cloning/rendering or release.

No change here authorizes unreviewed generated audio, private sample download to a public URL, the release of payment-protected audiobook tracks, or the unconsented re-creation of a third-party identifiable voice.
