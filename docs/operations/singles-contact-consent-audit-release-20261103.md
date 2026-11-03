# EKODI Singles contact-consent audit — protected migration handoff

Date: 2026-11-03 (Asia/Seoul)
Task ID: `singles-contact-audit-schema-20261103`

## Provenance
- Authoring PR: #7910, source commit `21abc6a954708edcf7fa4f8826024d15d5911777`.
- Orchestrator release PR: #7911, exact recovery branch `ai/chatgpt/orch_recovery_21abc6a954708edcf7fa4f8826024d15`.
- This is a documentation-only continuation to initiate authenticated required checks after the bot-origin recovery PR reported `authentic_required_checks_not_green`. It neither alters code nor fabricates a release receipt.

## Scope / safeguards
- Add one migration for a service-role-only, RLS-protected, data-minimizing contact consent receipt and atomic writer.
- Add rollback-only pgTAP synthetic settlement/refund/block/consent-version tests. Synthetic .invalid users only.
- No raw contacts or sensitive profile values in the receipt, no new fees, no automatic payments, no global public launch.
- All 21 EKODI Supreme Attributes assessed with priority on security, verifiability, data sovereignty, reversibility, privacy, least privilege, and simplicity.
- Schema and code **must not** be promoted together without verifying that the database contract exists in production before changing the Edge function.
- This release consists of *schema only*, not a new live API version.

## Required gates
- Complete authenticated CI / Supabase Local CI and protected orchestrator merge.
- Confirm migration is actually applied to the authorized Supabase project and inspect RLS/grants, function signature and synthetic behavioral evidence before deploying dependent Edge code through its own recovery PR.
- Financial live-bank E2E, adult identification provider, consent retention/revocation policy, and competent Korean authority legal assessment remain owner-controlled gates before general public paid launch.

This file does not approve operational migration bypass, production credential usage, or public release; completion claims must be evidence based.
