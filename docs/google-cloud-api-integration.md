# EKODI Google Cloud / Gemini API 통합 운영

Owner intent: #5291 · Agent: ChatGPT under EKODI AI · 2026-10-19

## Canonical boundary
- Management surface: existing EKODI `/admin/control` → **외부 서비스 통합 관리 → Google Cloud** and existing AI provider administration.
- Read-only Google Cloud project inventory originates from explicitly configured environment identifiers only; it is not Google Cloud IAM or Service Usage telemetry.
- Google account sign-in establishes identity; it **never** implies ownership of a Google Cloud project or Gemini paid credits.
- Never put API keys, OAuth refresh tokens, service account JSON, or private billing data into browser JS, git, logs or audit payloads.

## Configuration
- `GOOGLE_CLOUD_PROJECT_ID`: primary project identifier (optional; use an existing authorized project if possible).
- `GOOGLE_CLOUD_PROJECTS_JSON`: optional JSON list of project IDs or objects with `projectId`; service IDs are never accepted from arbitrary URLs.
- `GEMINI_PROJECT_ID` and `GEMINI_PROJECT_ID_2`…`_5`: existing binding compatibility.
- `GEMINI_API_KEY`: existing encrypted Worker secret. Use the existing EKODI provider admin secret flow. **Do not add the key to a file or a screenshot.**
- `EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED`: optional operator **attestation**, default false. Before enabling it, independently verify in Google AI Studio that the **specific API project and model** are on an eligible free tier and that the selected API key belongs to the intended project. This is not a live Google billing/usage assertion. Runtime Google configuration can change; review changes and 429/403 responses. The EKODI gateway, scheduled probes, manual checks, and separate Gemini orchestrator provider adapter skip production Gemini while attestation is absent; the existing free router may use another approved resource or Core-only fallback.

## Google Cloud external owner authority
The EKODI agent cannot enable Google Cloud APIs, set IAM, grant OAuth consent, or change billing without a directly authorized Google Cloud principal. The read-only registry links to Google Cloud API Library, credentials, quota dashboard, billing console and Google AI Studio keys/usage. Unverified remains **미검증**. A configured project ID is not equivalent to an enabled API or a valid credential.

## Charge avoidance
- The EKODI policy already sets `automaticPaidBudgetKrw: 0` and `paidApiAutoEscalation: false`; retain these.
- The Gemini free-tier attestation is an operator-defined gate, **not** a Google-provided hard budget cutoff. Google Cloud budgets often alert, rather than absolutely stop a bill.
- Separate Google Developer API free-tier selection from Google Cloud Vertex AI; do not treat Vertex AI pricing or free trials as equivalent.
- Never rotate multiple project keys to evade provider limits. Respect provider quotas, throttling and terms.
- Never send sensitive, tenant-owned, church, employee or member data through a personal/free model without an appropriate legal and privacy basis.

## Verification
1. `node --test test/google-cloud-project-registry.test.mjs test/ai-provider-control.test.mjs`
2. `node --check google-cloud-project-registry.js`, `node --check ai-provider-control.js`, `node --check admin-provider-control.js`
3. Validate both gateway and standalone orchestrator path (neither may send an unverified production Gemini call). Source PR + required CI/security + parallel conflict guard + EKODI Orchestrator provenance and Human Gate as applicable.
4. Guarded staging/production deploy. Real `https://ekodi.kr/admin/control` role-based PC/mobile confirmation: only authorized admin sees project links; others do not; no key values; missing project says unverified; no Gemini provider fetch without free-tier attestation.
5. Verify the actual Google Console project/API/credential/billing externally before declaring the provider operational.
6. Roll back by reverting the source PR via protected process. Setting `EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED=false` re-establishes the production Gemini execution block, but is not a substitute for revoking externally compromised keys.

## Non-goals
No automatic GCP provisioning, OAuth scope expansion, IAM grants, billing enablement, quota bypass, automatic paid API upgrade, credential display, direct production deployment, or claim of live-Google health from source configuration.
