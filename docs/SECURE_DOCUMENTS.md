# EKODI Secure Documents Core (draft security-gated)
  
Common service contract: `ekodi.secure-documents.v1`.

## Boundaries
- Unlike `config/personal-credential-vault-policy.json`, this service holds only **documents**. It does not change the credential vault's prohibition of government identity documents.
- Person scope uses the canonical EKODI `people.id`. Workspace scope is an immutable `tenants.id`, not a hostname or URL slug. Workspace authority must be checked server-side per operation; platform admin is not a tenant role.
- Never upload an actual resident-registration-number-bearing ID, image of an ID, bank passbook, certificate or private key to a test system.
- Redaction is an **explicit owner-provided redacted copy**, not an automatic OCR claim. Never promise that text is safely masked in arbitrary PDFs.
- Every tenant site can mount the same UI adapter with an immutable workspace id and authenticated session provider; the site may not skip central authorization.

## Service rollout
1. Apply versioned migration only to an isolated staging database. Review existing `storage.objects` policies; a bucket with `public=false` is not sufficient if an old permissive RLS policy grants downloads.
2. Configure the central server-side encryption key (rotateable and backed by managed secret storage), secure document scanner, host and strict allow list. Never embed keys in HTML or JavaScript.
3. Verify data-residency/overseas-transfer and retention rules before any real customer document enters storage. Current production Supabase region must not be assumed adequate for regulated ID copies.
4. Apply deploy gates: synthetic upload → authenticated scoped listing → denied other-person/other-workspace access → recipient authentication/step-up → expiring share → immediate revocation → ciphertext deletion and backup lifecycle checks.
5. Turn on `SECURE_DOCUMENTS_ACTIVE` only after all checks are signed off, and run a guarded release. Without this flag the API must return inactive and never store bytes.

## Endpoint contract
The public client only calls the central Edge Function `secure-documents-api` using a verified EKODI access token. It cannot access private storage itself. The shared UI adapter lives at `/my/docs/secure-widget.js`; the personal entry is `/my/docs/secure.html`. A tenant site may embed the adapter but cannot pass arbitrary acting user IDs. User scope is `person`, workspace scope is `workspace`.

- `GET /?action=status`: redacted activation state (no secrets).
- `GET /?action=list&scope=person|workspace&workspace_id=...`: owner/authorized steward metadata only.
- `POST /?action=upload` with multipart body: source filename never logged, file is encrypted before storage; uploads require scanner and compliance gates.
- `POST /?action=share`: named verified recipient, step-up, max 168h, redacted version, one-time opaque token (only its hash is stored), recipient-bound view. Never expose storage signed URLs.
- `POST /?action=revoke`: immediate recipient grant cutoff.
- `GET /?action=shares&document_id=...`: metadata-only grant list, only after ownership/tenant steward check.
- `POST /?action=open`: verified recipient, active grant and atomic view-limit check, never a signed storage URL.
- Original deletion and verifiable physical purge are **not implemented**. These remain blocked pending retention, scheduled cleanup and backup reconciliation review.
- `POST /?action=expire`: secret-authenticated scheduler-only status cleanup (scheduler not yet configured). Expiry is still checked synchronously on every shared read; no separate share copy is stored.

## Caveats
This stage is **development only**: no real personal documents are permitted; encrypted upload, redaction, multi-tenant authorization and deletion have not passed end-to-end tests. Network-delivered copies, screenshots and previously downloaded files cannot be remotely erased. Expiring access is not equivalent to deleting copies already distributed. Legal holds and backup lifecycles are separate from share grants. Audit contains only metadata and never the original document or token.

## Reusable site adapter example

A site must obtain its canonical, immutable tenant UUID from the trusted EKODI workspace context; never hardcode a slug as an authorization claim. The site must use the same-origin central module:

```js
import { mountSecureDocuments } from "/my/docs/secure-widget.js";
await mountSecureDocuments(document.querySelector("#secure-documents"), {
  scope: "workspace",
  workspaceId: verifiedWorkspace.id,
  config: window.EKODI_MY_CONFIG
});
```

Personal mode: `mountSecureDocuments(element, {scope:"person"})`. All actual authorization is reverified by the central API; simply mounting or supplying an identifier never grants document access. Share recipients require verified EKODI authentication plus a recent strong MFA step-up to open the document. This adapter is a source integration contract; it is not yet live on every site.
