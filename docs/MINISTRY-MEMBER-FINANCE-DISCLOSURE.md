# EKODI 교회·선교회 회원 개인기록 및 선택형 회계공개
> Status: protected implementation foundation, NOT production enabled. Source of truth: EKODI Orchestrator.

## Verified baseline (2026-10-28)
- Production project: `ekodi-platform-prod` (Supabase). Development project is separate.
- Church: `church_private.members`, `attendance_records`, `offerings`, `ledger_entries` exist.
- Existing self-service is `church-member-giving-api`, `church-member-attendance-api` and the ekodi-church Pages surfaces `/my/giving/`, `/my/attendance/`.
- Church private-member table currently has no member rows, while the generic `tenant_members` registry has four active church relations. These are **different** membership scopes: generic membership must not automatically unlock personal church giving. Never generate fictitious attendance or giving history.
- Mission: canonical tenant slug `ekodimission`; four active `tenant_members` relations observed in production. `presence-attendance-api`, mission event applications and public organization-finance schema exist, but a church-equivalent donor ledger/linked-person read API is not yet confirmed.
- `organization_finance_reports` currently has zero `published` rows (across the current production database at inspection time).
- A Google login alone does NOT constitute an active local membership. Account matching by email alone does not authorize a disclosure.

## Target site surfaces
- Church user page: `/ekodichurch/my/` links to personal attendance and giving; add member-only `/ekodichurch/my/finance/` only AFTER an approved read API is available.
- Mission user page: `/ekodimission/my/` with participation, personal giving and organizational summaries. Preserve the existing mission shell. Do not silently open the financial donation collection workflow.
- Site-local administrative controls for recording/approving records; centralized `/admin` only for identity, entitlement, security, audit, accounting control and global operations.
- Church and mission each retain their own tenant ledger, publication policy and approval history. A transfer between them is two linked ledger postings, never a shared blended balance.

## Member read contract
1. Verify the bearer token server-side against the canonical Supabase Auth endpoint (not a browser claim).
2. Resolve canonical tenant in a closed allowlist: `ekodichurch -> ekodi-church` or `ekodimission -> ekodimission`.
3. Resolve an **active, verified** local membership using `auth.users.id` and matching tenant: `church_private.members.auth_user_id` for church or `tenant_members.user_id` for mission. No raw email, URL parameter, or localStorage state may authorize membership.
4. For *personal records*, reuse church self-service functions. For mission, create an explicitly linked donor/participation record keyed to the authenticated subject; never link ambiguous bank transfer names automatically.
5. For *shared accounts*, only read an **immutable approved aggregate snapshot**. Do not read or return raw offering, bank transfer, attendance, donation, recipient, receipt or evidence rows.
6. The requested date range and sections must be a subset of the approved snapshot, never additive. A role change or revoked publication denies the next request; cache disabled on private responses.
7. Individual contributors and small cohorts remain suppressed, even if their names have been removed. Suppressed lines are not included in totals or back-calculated by charts.
8. Nonexistent or unapproved information is explicitly displayed as `자료 없음` or `승인된 자료 없음`; never fabricated.

## Finance snapshot proposed schema (future separate protected migration)
- Private tenant-scoped table: `ministry_private.finance_publications`: id, tenant_id, period_start, period_end, status = draft|approved|revoked, audience = members|public, allowed_sections, approved_at, approved_by, source_revision, immutable_hash.
- Private child table: `ministry_private.finance_publication_blocks`: publication_id, section (income|expense|balance|budget), controlled category, amount, source_count, distinct_contributors (for income), approved, unique section/category.
- Private audit log: editor, approver, approval/revocation time, originating ledger close hash, no private receipt image or full bank account number.
- RLS on all tables; `anon`/`authenticated` have no direct raw table grants. Only server-held, validated service access may resolve the approved projection.
- Approval is an explicit privileged action; never infer approval from `publication_state='published'` in an unrelated module.
- `ministry-finance-disclosure-policy.js` implements the final defensive projection, but **must only be called on server-side validated objects**. It must not be used to authorize browser claims.

## Release criteria
1. Verify current church source and central route ownership (church static Pages is a separate repository); register new routes only in their correct canonical deploy manifest.
2. Resolve member enrollment identity and consent; demonstrate church member, mission member, unregistered Google user, revoked user and cross-tenant user test cases.
3. Add separate mission donor/participation ledger mapping after reconciliation with primary records, preventing duplicate income entries.
4. Create the protected migration using the repository's Supabase migration tool; apply and test on **development** first, check RLS, grants, schema diff and security advisors. Production DDL requires EKODI guarded change control.
5. Implement a read-only authenticated server endpoint that calls the projection module after verifying bearer and membership. Deny any client-supplied tenant membership data.
6. Build tenant-local UI with date/category filtering and download only of approved aggregate fields.
7. Test suppression by low count, unapproved row, invalid selection, cross-tenant ID, stale login, manipulated URL, revocation, empty data, mobile, screenshot and PDFs. Test that raw PII NEVER appears in an HTTP response, error or analytics.
8. Run mandatory CI, protected PR review, owner Human Gate, staging and production verification under EKODI Orchestrator. No public disclosure until release evidence and accounting approval are recorded.

## Already implemented in this PR
- Allowlisted canonical tenant and section values.
- Active, verified local-member and tenant-match guards for any approved aggregate.
- Immutable approval/status guard and per-section selection.
- Privacy-aware suppression of small disclosure groups.
- Fixed safe labels and numeric aggregate projection without donor/recipient/transaction identifiers.
- Node test suite for denied identities, cross-tenant access, unapproved or revoked snapshots, small groups, malformed amounts and private-field removal.

**Not yet implemented:** SQL tables, validated live read API, admin approval UI, mission personal donor ledger, church/mission UI routing, production deployment. This PR must not be described as a complete live service.
