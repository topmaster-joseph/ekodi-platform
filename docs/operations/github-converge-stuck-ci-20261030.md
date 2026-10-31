# EKODI convergence healthy-CI duplicate prevention (#6630)

Incident: official PR #6886 head 04145fd335d2b19a2a041dc3935cbdb5a763177d, convergence run 40994386942 reported stuck-required-check-redispatched test and launched ci.yml despite existing authentic CI still executing. A completed check suite lookup is not reliable proof that its incomplete test job is orphaned.

Fix: require the actual GitHub check run started_at to exceed CONVERGE_STUCK_MS before treating it as stuck, regardless of associated suite state. This leaves the historical orphan case (#5625, older than one hour) recoverable after the threshold, while avoiding new CI fanout for healthy checks. Missing required checks still use the existing separate grace path. A missing or invalid started_at is not sufficient evidence for expensive redispatch. Keep exact-head CI, authenticated status publication, 8min stuck threshold, 10min convergence handoff budget, 8-run per-head cap, and all owner gates.

Tests: node --test test/converge-stuck-check.test.mjs; official exact-head CI and protected EKODI recovery PR required. No retry storm, direct merge, deployment, token, secret or privileged bypass.