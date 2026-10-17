# EKODI Research Worker — Cloudflare Static Assets redirect-loop fix

## Provenance
- Owner-approved Research source: PR #5091, commit `8242c82185650b6abe483f1e043c2f525734f4e2`.
- Owner-approved guarded Site Core canary: PR #5125, commit `748588a8dfd17b9958345f7b77ec8d66e0edbf2c`.
- Official route release merged via recovery PR #5126, merge commit `0ec4376fea1189335c110d4d960550d82099fe88`.
- Guarded Site Core run [39016637786](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/39016637786) refused candidate promotion because `https://ekodi.kr/research/` returned HTTP 307 instead of 200; auto rollback was invoked, but separate `/pay` rollback verification also failed.

## Failure mechanism
The Research Worker previously rewrote the *canonical public directory route* `/research/` into `/research/index.html` before calling `env.ASSETS.fetch()`. The Cloudflare static assets path canonicalization maps direct `index.html` URLs back to directory URLs, causing an HTTP 307 redirect cycle at the Research surface rather than serving the page. This is also consistent with previously observed redirect-loop behavior on the Education origin.

## Minimal change
- Keep `/research/` unchanged for Cloudflare asset lookup, so its `index.html` is resolved without a redirect.
- Convert explicit requests to `/research/index.html` into the same canonical trailing-slash URL using 308 without passing the path to the asset canonicalizer.
- Preserve query parameters and all Research/Shell security headers, data, authentication, billing, consultation and AI restrictions.
- Add executable mock-asset regression tests rejecting `index.html` rewrites that return 307, and verifying exact canonical 308 behavior.

## Release gates
This is **new executable code** not covered by prior source approval. Exact SHA owner Human Gate, official Orchestrator receipt, mandatory CI/staging/protected deploy, rollback protection and genuine live PC/mobile Research verification are required before production.

The unrelated `/pay` rollback marker mismatch must be investigated separately; do not weaken existing rollback or payment safeguards. Never claim the worker is live based on the source patch or tests alone.

## Owner-authored CI on official recovery PR
- Exact user-approved source: PR #5129 at `504da350bf09532f9f25b2982676743c2f5aaa93`.
- Verified owner comment [#6231747965](https://github.com/topmaster-joseph/ekodi-platform/pull/5129#issuecomment-6231747965), then `orchestrator-human-gate-approved` label.
- Official EKODI recovery task `orch_recovery_504da350bf09532f9f25b2982676743c`, PR #5131.
- Bot-created PR checks were `action_required`; this owner-authored documentation-only commit regenerates genuine checks without altering the approved executable code. Neither merge nor staging/production is declared complete.

## Post-synchronization CI regeneration
- The official EKODI PR convergence synchronized owner-verified source `0c1d733198202db495f29512a56050f5db8f1408` with current `main`, producing commit `a70f170f7c73e719ca342ae48c4575307b142686`.
- Bot-created events returned `action_required` without execution. This **documentation-only** owner-authored followup causes genuine CI and staged checks to rerun against the synchronized HEAD. No executable Research change, storage flag, payment or rollback bypass.
- Owner approval is anchored to original exact-SHA PR #5129 and official recovery task `orch_recovery_504da350bf09532f9f25b2982676743c`. Require protected merge and real release receipts before any production-complete assertion.
