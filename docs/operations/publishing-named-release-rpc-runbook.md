# EKODI Publishing — named RPC release authorization (protected rollout)

**Orchestrator:** EKODI Orchestrator · Parent #6331 · private registration PR #6638 · consumer protection PR #6718. This implements a publisher-owned **read-only verification primitive**, **not** production deployment or sale authorization.

## Service ownership

- `publishing-release-entry.js` exports **two Cloudflare named WorkerEntrypoints**. `BooksPublisherReleaseGate` permits only the `books` caller role; `MallPublisherReleaseGate` only `ekodimall`. Neither is exposed as an HTTP route. The existing public Publishing Worker is unchanged.
- `publishing/human/publisher-release-rpc-service.js` pins caller role to the selected entrypoint, ignores request-supplied `approved` booleans, refuses cross-channel requests, and invokes `verifyPrivatePublisherRelease` with a server-generated clock.
- `publishing/human/private-publisher-release-authority.js` checks the publisher's private DB for the current matching immutable edition/revision, release timestamp, both channels' prepared+activated proof, authorship/rights/signatures and digest; re-reads the revision after asynchronous validation. Denied responses do not reveal the title or internal source.
- `publishing/human/private-release-atomic-ledger.js` is still responsible for transactional state+audit+private outbox, not these read RPCs.

## Service binding contract (illustration, **NOT** deployable as-is)

The Draft branch now selects `main = "publishing-release-entry.js"` in **staging only**, with `PUBLISHING_PRIVATE_RELEASE_ENABLED = "false"`. This exposes no new HTTP route and does not enable registration, sale, cron or a real RPC consumer binding. Promoting this staging change or enabling the flag still requires owner-reviewed private D1, author/publisher approval verifier, R2 object store, audit and role-specific bindings.

The **Books Worker** must bind `PUBLISHING_RELEASE_GATE` to the publisher's exact, protected Worker name with `entrypoint = "BooksPublisherReleaseGate"`. The **Mall Worker** must separately bind its server-only gate with `entrypoint = "MallPublisherReleaseGate"`. Publishing service credentials must not be exposed to browser JS; HTTP fallback and unauthorized default entrypoint must not accept release RPC.

For example, once the actual Worker name has been obtained from the verified environment:

```toml
# EXAMPLE ONLY — check against real account/project before use.
[[services]]
binding = "PUBLISHING_RELEASE_GATE"
service = "<verified-publishing-worker-name>"
entrypoint = "BooksPublisherReleaseGate"
```

The Mall service uses a *separate* `[[services]]` entry with the same binding name, verified service name, and `MallPublisherReleaseGate` entrypoint. Do not share an entrypoint between both consumers.

## Explicit rollback and acceptance requirements

1. Confirm the publisher's immutable edition exists and has final author/publisher digest-matched signatures, source/file integrity, current rights and legally verified price/identifiers. No release from a review-only record.
2. Apply isolated Publishing D1 migrations `001`, `002` under protected deployment with snapshot/rollback. Provision private R2 and trusted editorial verification RPC. No public catalogue migration.
3. In isolated staging, bind *each* named gate to its authorized consumer; verify calls cannot select the opposite channel and unauthorized calls/failed DB/expired rights deny.
4. Publish a **synthetic test edition only** in staging and verify Books quote/create/confirm/download and Mall list/price/cart/file access. Test partial-channel failure, signature revocation, stale revision and rollback.
5. Clear required CI for exact head SHA, orchestrator owner Human Gate, protected merge, post-merge/PC/mobile/anonymous-authenticated checks and incident rollback. Until **all** are proven, leave `PUBLISHING_PRIVATE_RELEASE_ENABLED` off and do not enable cron or expose new book listings.

## Current status

Code and deterministic SQLite tests submitted in Draft #6638; this runbook itself does **not** configure the named entrypoints, D1, R2, any service bindings, staging/prod deployment, cron, customer access or payments. The EPUB editions of the Jubilee Theology two-book series are editorial revision 8 and **not approved for sale**.
