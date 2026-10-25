# EKODI Books live-sale release replay — 2026-10-25

- Publication: `BOOK-EKODI-000001` — 『에코디언을 찾아서』
- Protected source merge: `6401cd138a42f907831fc1a7b36409efa32cce6b`
- Orchestrator task: `orch_recovery_251f5f8058ee2db2fa528cdd01c8169f`
- Purpose: replay the dedicated guarded Books production lane after the post-merge dispatcher omitted static `books/**` assets.
- Required lane: `deploy-books.yml`
- Safety: this file carries no credentials, payment configuration, or deployment authority. Deployment remains gated by the EKODI Orchestrator receipt, staging gate, guarded Worker release, rollback protection, and production verification.
