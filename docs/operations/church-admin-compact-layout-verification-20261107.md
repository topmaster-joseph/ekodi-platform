# EKODI Church administrator compact UI — reviewed verification record

Task: Church admin seven-page unification, 2026-11-07  
Source: [protected recovery PR #8586](https://github.com/topmaster-joseph/ekodi-platform/pull/8586)  
Route family: `/ekodichurch/admin/` (both existing pastor and workspace-owned runtimes)

## Approved user-visible contract

- Use the same common/dedicated sidebar group **labels and order** at all Church admin pages: Service Settings first in Common Menu, then channel publishing, operations/documents, site settings, user authority, audit records; Dedicated Menu is today, people/care, worship/ministry, finance/proof, AI pastor assistant.
- The selected group is marked active. Members without authorization see its *label* as `span[aria-disabled=true]` with **no href**, not an accessible route. Unauthenticated users remain restricted. Service settings affect availability only, never grant permission.
- Remove the **visible duplicate** upper title, eyebrow and description without losing the semantic `h1`, document title, screen-reader accessibility or security state. Main content starts near the top.
- Place contextual sub-tabs under Work / Metrics, **left aligned** at every supported width. Existing tab links keep direct, reload and login-return URL semantics.
- The read/write security model and church/member, offering/finance, separate Mission data ownership remain unchanged.

## Evidence and safe release order

1. Initial head `78151c2f5140ef9031296ca76e3ab9f58dcc9777` passed Admin Runtime Contract, Dependency Security, Constitution, Conflict Guard, Zero-Subdomain, Supabase and AI Orchestration. Full CI alone failed two **new** test expectations using the raw unordered source registry instead of the approved Service-Settings-first menu projection.
2. Corrected test-only commit `e6b17bcef7fdf1e5390470c675fb11be04fc4b8f` passed the full CI and all other required checks.
3. Orchestrator updated the recovery branch against latest protected main. Fresh-head checks, official protected merge and any staging/production deployment must be verified separately; a source-only PR is not live evidence.
4. After an authorized release, inspect `overview`, `people`, `worship`, `offerings`, `ai`, `chrome`, `services` at 320/390/768/1366/1440 px. Compare all eleven group labels, verify left-aligned sub-tabs, keyboard focus and direct refresh. Validate guest restrictions, role-limited inert menu entries, and ability to access authorized church tasks without elevating privileges.
5. Church public homepage source C3 switch remains a distinct owner/operator release gate. Confirm actual `/ekodichurch/church-release.json` v2 source SHA and payload hash, public home/devotion/notices/schedule, preserved congregation notice, browser role canaries and rollback; never claim completion based only on passing PR CI.

This note contains no user identity, account token, transaction details or production approval.
