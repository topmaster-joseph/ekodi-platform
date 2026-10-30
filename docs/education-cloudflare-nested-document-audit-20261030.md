# EKODI Education native CSP nested-document audit

Date 2026-10-30. Incident #6936.

- Protected production source 0fc104edf9f7312854eab7d9ca950594c0718704, workflow 41001489721, then protected CSP audit source 9e8c44a4b6998db67a9a2297b13827fb446743f2 workflow 41005298747.
- Education Worker successfully published; canonical farm-marketing course, step=1..7 and same-origin JS/CSS serve production HTTP200.
- Both production workflows fail at *existing* AI bootcamp's compact-mobile native Chromium strict CSP audit, before the farm course live browser step; no claim of full production acceptance.
- Prior synchronous main document audit did not fix failure. The first-party browser context also observes nested document/iframe responses, but asynchronous response.text().then(trustCloudflareJsDetections) was not awaited before verifyKnownSecurityBlocks.
- This recovery makes every observed DOCUMENT response an explicit pending audit and awaits all pending audits before strict CSP verdict; it does not widen script pattern or SHA allowlist, suppress errors, allow unsafe-inline, bypass CSP, open network mutation or change permissions.
- A deterministic test holds a nested document response body pending while the final verdict awaits it, proves the exact known Cloudflare detector hash accepted only after audit, and rejects arbitrary inline script hash.
- Source PR #7016 superseded by EKODI Orchestrator sole official #7017 task orch_recovery_e1d0c64cb32fab479ea64af9e1d1af79.
- This owner-authored documentation-only commit requests genuine protected required checks on the official exact source, not bot action_required.
- Final closure is blocked until existing guarded Education deploy succeeds with entire real 320/390/768/1366/1440px classroom+farm+studio+documents native acceptance and PNG saving, on canonical apex /edu route.

## Authenticated required-check replay after protected-main sync
- Former official head 06b0ac9e25e5974c2aba35a625dbf950665737f4 passed genuine required source CI. The Orchestrator synchronized source to 05cdaa25c28cf705c172ec55c5d57354d8f92762, producing bot action_required results that are not valid required checks.
- This owner-authored docs-only checkpoint requests genuine CI on the exact currently synchronized official release head without weakening any security policy, impersonating required checks or issuing production deployment. EKODI orchestrator governs protected merge and release. Do not close #6936 until native production acceptance passes.

## Repeat protected main convergence
- Owner-authored source head e6f21d0c4e9dc6b46680aaf489285841c1bf901e passed all genuine CI; subsequent automatic main synchronization produced current official head 572544bb693b09addf552b2db8b913dc5a62c9b6 whose bot action_required is not proof. This docs-only owner-authored checkpoint asks authentic required checks again, without direct deployment, forced merge, policy change, bypass or fake legacy status. EKODI Orchestrator should prioritize this already green and scoped Education fix in protected merge order and re-run guarded production acceptance.
