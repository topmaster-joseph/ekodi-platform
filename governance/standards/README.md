# EKODI International Standards Maturity Governance

This directory is the evidence-oriented source of truth for EKODI's international standards maturity program.

## Operating principle

EKODI does not equate an internal score with certification. The platform maintains two separate facts:

1. **Implementation maturity** — internal evidence-based score from 0 to 5.
2. **Certification status** — only an accredited external certification may set this to certified.

The maturity model is subordinate to `CONSTITUTION.md`. It supports the Constitution's verification-first, security-native, provider-independent and continuously improving operating model.

## Current reference standards

- ISO/IEC 42001:2023 — AI management systems
- ISO/IEC 23894:2023 — AI risk management
- ISO/IEC 27001:2022 — information security management
- ISO/IEC 27017:2026 — cloud security controls
- ISO/IEC 27701:2025 — privacy information management
- ISO/IEC 27018:2025 — public cloud PII protection
- ISO/IEC 20000-1:2018 — IT service management
- ISO 22301:2019 — business continuity management
- ISO/IEC 33020:2019 — process capability measurement
- ISO/IEC 25010:2023 — software product quality model

Versions must be checked against official standards publishers before a reference is upgraded.

## Files

- `ekodi-international-maturity-model.json` — domains, weights, internal maturity scale and governance rules.
- `ekodi-current-maturity.json` — current evidence, gaps and next actions.
- `history/YYYY-MM-DD.json` — immutable assessment snapshots.
- `scripts/assess-international-maturity.mjs` — validates score integrity and generates reports.
- `.github/workflows/international-maturity-audit.yml` — validates on relevant PRs/pushes and runs a weekly evidence report.

## Required change discipline

A maturity score may increase only when evidence is added or strengthened. Every assessment update must:

1. cite implementation evidence;
2. retain at least one explicit gap until the domain is independently demonstrated as fully optimized;
3. define next actions;
4. append a dated history snapshot;
5. pass the automated maturity audit;
6. be reviewed through the normal protected-branch process.

A score decrease is allowed and expected when evidence degrades, a standard is revised, an incident exposes a gap, or control effectiveness falls.

## Management cycle

**Observe → Assess → Evidence → Gap → Improve → Verify → Record → Reassess**

The target is not a permanent “5.0 badge”. Level 5 means a functioning closed improvement loop with measurable evidence, independent reviewability and controlled adaptation. If those conditions weaken, the score must fall.

## Initial baseline

The 2026-09-11 baseline is an internal implementation assessment. It is not an ISO certification audit. The largest initial gaps are privacy evidence, formal service-level governance, BIA/RTO/RPO and recovery exercises, formal ISMS/AIMS management-review records, and unified measurable quality/process scorecards.
