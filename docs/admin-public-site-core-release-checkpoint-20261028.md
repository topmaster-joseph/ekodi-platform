# EKODI public-site controls — guarded Site Core release checkpoint

- Parent request: #6359 (Admin `/admin/settings/public-site-controls` two-pane redesign).
- Official feature PR #6442 merged through the EKODI protected converger as `349d2906ac2ee5ebfeef601c6a66f6e70630544d`.
- Source implementation: `admin-public-site-controls.js`; `scripts/build.mjs` includes that file in the Site Core build asset list.
- Root cause after merge: the guarded release dispatch selector `sharedSiteTouched` in `scripts/converge-orchestrated-pr-merge.mjs` omitted `admin-public-site-controls.js`. A token-mediated merge does not emit the normal production push event.
- Release issue: #6508. Source PR #6510 was superseded by EKODI Orchestrator-issued recovery PR #6513.
- Fix: add the exact UI asset filename to the guarded Site Core dispatch selector. Keep the existing `scripts/converge-orchestrated-pr-merge.mjs` self-change trigger so this protected merge dispatches a guarded Site Core release. Regression: `test/ai-provider-live-verifier.test.mjs` asserts both the build asset and dispatch owner.
- E2E limitation: production authenticated Admin run #40690514778 failed at initial `/admin/` readiness with HTTP 429 rate limit, before the publication editor was reached; its temporary session was revoked. This is not proof of a publication editor defect, and not production success.
- Production admission: EKODI Orchestrator only; full exact-HEAD required CI, signed/protected merge, guarded Site Core release, live canonical host verification, authenticated PC/mobile publication panel verification and rollback evidence. Do not claim completion until verified.
- No production data mutation, security relaxation, or manual main push in this checkpoint.

This owner-authored continuity commit is a normal source-evidence update on an Orchestrator-issued isolated branch so GitHub can run fresh, authentic checks. It does not publish any status or bypass an approval gate.
