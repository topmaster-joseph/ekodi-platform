# Jubilee Theology linked author logins (publisher-scoped)

Task: `jubilee-author-alias-20261104` / EKODI Orchestrator issue #7666.

## Identity boundary

- Keep the canonical manuscript author in the protected `PUBLISHING_JUBILEE_AUTHOR_USER_ID` Worker binding. All two Jubilee projects keep this one `author_user_id` and one set of private R2/D1 ingestion receipts.
- Existing EKODI Persons, login providers, points, billing, subscriptions and unrelated author projects **must not be merged** as a side effect.
- Two additional Supabase accounts may be granted **scoped access only** after the platform operator verifies both identities and the author's authorization; they are not registered as new authors or duplicates.

## Protected runtime configuration

Use an operator-managed, audited deployment setting, never browser local storage, a public page, a GitHub issue, or a user-supplied request body:

```text
PUBLISHING_JUBILEE_AUTHOR_USER_ID = <verified primary Supabase auth user UUID>
PUBLISHING_JUBILEE_AUTHOR_ALIASES = [{"userId":"<verified alternate UUID 1>","email":"<verified email 1>"},{"userId":"<verified alternate UUID 2>","email":"<verified email 2>"}]
```

Two independently registered Supabase login accounts may point to one EKODI Person. **Each auth user UUID is individually matched** against the email-confirmed `/auth/v1/user` response. Config missing, malformed, mismatched email or unexpected extra JSON fields fails closed. Configure only after checking each authenticated account; a verified email by itself is not proof that the publisher authorized the delegation.

## Permissions and rollout

- Any verified linked login can call the **private**, idempotent Jubilee register endpoint; all records are created or found under the **primary** author user ID.
- Linked login sees its own unrelated projects, and only the primary author's two `humanities/human` Jubilee projects by exact title. All other owner projects remain hidden.
- A linked login may revise or submit the same two manuscripts under the existing paid-entitlement gates; the audit event records the **actual acting Supabase user ID**.
- `author_approve` remains **primary author only**. No publisher/editor/admin grants, rights attestation, price, checkout, sale, release, or protected R2/D1 ingest privileges are conferred.
- The existing private manuscript service continues to require the same canonical primary owner and a separately verified publisher service principal.
- Revoke a secondary login by removing its entry from the protected configuration and deploying through the governed lane; do not erase manuscripts or merge EKODI Persons.

## Production verification gate

1. Verify protected bindings exist in authorized staging and production release configuration (do not print their values to logs).
2. Sign in with each of the three independently verified Supabase logins and use `/publishing/human/manage/`. Test initial registration, repeat-registration, and readback of the **same two project IDs**.
3. Confirm an unrelated owner project is invisible to linked logins (HTTP 404) and a fourth account cannot register (403).
4. Confirm linked account `author_approve` is denied (403), while draft revisions are logged against the true actor; check no admin/publisher-role escalation.
5. Independently test last reviewed DOCX/EPUB/PDF identity and R2/D1 readback under the protected ingestion gate. Registering draft metadata alone is not proof of manuscript ingestion.
6. Record encrypted/private audit evidence and the deployment run ID before reporting live completion. Never expose manuscript bytes or account UUIDs in public PR/issue comments.

Until these gates pass, status remains **implemented-pending-protected-bindings-and-verified-live-registration**.