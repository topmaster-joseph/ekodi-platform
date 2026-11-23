# EKODI Devotion — first-party native Chromium verification (2026-11-18)

## Owner intent and official provenance
- Owner instruction: continue actual operation verification with EKODI's own browser, not external paid browsers.
- Source issue: #9730.
- Original functional release: #9732, official merge `37f7ccfc1972ae004db6e7ae487ea27302aaf62c`, Bible protected production run #43584731744 (2026-11-14).
- Native-verification worker: source PR #9892, immutable tested candidate `ad7c4f7b6e5d679d1e8ac0fbbb84e454e0598c55`. Worker PR was closed as superseded, **not merged**.
- EKODI Orchestrator official recovery: PR #9893, task `orch_recovery_ad7c4f7b6e5d679d1e8ac0fbbb84e454`. The official branch must preserve the exact tested worker source as an ancestor.
- Stale recovery #9891 based on earlier failing 320px test `a9c39cfc705b69986ed20b7eebfaf030971b26fe` was closed as a superseded, nonmerged duplicate. No stale PR is an approved integration source.

## Observed real-host browser evidence
The connected GitHub first-party EKODI Native Devotion Guest Browser ran isolated headless Chromium/Playwright, not a paid third-party browser:
- Run: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/44124614849
- Job: 134184871777, **SUCCESS**.
- Verification date: 2026-11-18 KST, canonical public site `https://ekodi.kr/ekodichurch/devotion/?date=2026-11-18`.
- Total: **41 passed, 0 failed** (run log `[EKODI-NATIVE-GUEST] SUMMARY`).
- Desktop 1440×900 and mobile 390×844: HTTP 200; default engine `device`; loop visible and initially OFF; clicking ON/OFF changes `aria-pressed` true/false; advanced device settings open; loop/pause/stop occupy the same nonoverlapping row at 44px minimum with no horizontal overflow.
- Compact mobile 320px: collapsed settings intentionally hide inactive pause/stop and keep loop visible; after explicitly opening Settings, three 44px controls are aligned, within viewport and without horizontal overflow.
- Existing public Mission guest tests still passed: unauthenticated header controls, future-date 403, no future-content leak, redirects to today's published Scripture, desktop/mobile no page errors.
- Native Chromium with **locally instrumented** speechSynthesis (test-only synthetic voices, no external credentials) verified no autoplay, preferred test `Google 한국어` voice, a 21-segment Scripture narration restarted at segment 1 as the 22nd `speak` call when repeat was enabled, and Stop disabled repeat/canceled pending callbacks.
- The test voice is simulated. **No assertion of physical human-audible playback quality** or an installed end-user OS voice; require a legitimate device-specific proof for that separate claim.
- Public real page controls and layout checks were not simulated; only the speech output callback to make a deterministic loop-completion test was instrumented.

## Guarded convergence continuity
This is a docs-only, owner-connected checkpoint on the already-issued official recovery branch. It does **not** create/replace a release receipt, forge checks, change production app behavior, grant new authority, merge or deploy manually. It requests normal GitHub CI, EKODI AI Orchestration Gate, parallel-change review and the existing `EKODI Orchestrated PR Convergent Merge` after the GitHub-Actions-issued PR presented `action_required` placeholders rather than authenticated checks.

The official reconciler must verify latest-main source inclusion, exact branch receipt and all *new* required checks on the actual recovery head. Since this adds a browser test script only, any postmerge production-bound run is governed by the canonical nondeployment classification and cannot be misrepresented as proof of new app functionality. For complete closure, verify the official browser workflow against the real host after protected integration, preserve screenshots/evidence with retention, and record any physical-device audio limitation explicitly.

No protected-main push, direct deploy, security bypass, quota workaround or irreversible mutation is authorized by this checkpoint.
