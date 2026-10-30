# EKODI Research OS — Crossref public metadata search (2026-10-30)

## Scope and owner
- Owner: EKODI Orchestrator; canonical route: `https://ekodi.kr/research/` through the existing Education Worker.
- Source branch: `ai/chatgpt/research-crossref-metadata-20261030`.
- No new standalone Worker, database, API key, merchant account, or paid external AI dependency.
- Adds public `GET /research/api/literature?q=<query or DOI>` and a responsive, accessible research-literature section in the existing public interface.
- For DOI inputs, requests the exact Crossref registration record. For keyword/title inputs, retrieves at most eight Crossref records and normalizes title, authors, year, journal, publisher and DOI.

## Research integrity and limitations
- Crossref bibliographic registration metadata is **not** a peer-review, journal quality, originality, retraction, or researcher identity certification.
- Do not claim external AI, full-text collection, systematic literature review, citation indexing, plagiarism check or verified scholarly conclusions.
- No manuscript uploads, private source data, persistent browser research history, third-party tokens, payment or administrator privileges were introduced.
- Query length 3–160, only public GET, server-side fixed Crossref host, 7-second deadline and response-size bound; JSON and HTML rendered through textContent, not innerHTML.
- Upstream 404, 429, 5xx, malformed payload and outage are explicitly distinguished/fail closed. Responses are no-store.
- Avoid entering names or sensitive content of research participants into public keyword searches. Queries are sent to Crossref.
- Crossref request quotas still apply. Before broad release, verify edge rate limiting/abuse mitigation and external API policy. Do not imply per-user throttling has been built.

## Mandatory verification
1. `node --test test/research-platform.test.mjs test/research-crossref.test.mjs`.
2. Standard repository CI, security, source provenance and canonical routing regression checks.
3. Staging: Research UI loads on PC/mobile, link/button layout, keyboard focus, no generic workspace or redirect loop.
4. Staging API: valid title search returns bounded metadata, exact DOI lookup matches registration record, absent DOI returns no result, rate limit and provider errors are not false successes.
5. Protected production release only through EKODI Orchestrator with exact source approval, receipt, canary, rollback and independently collected PC/mobile evidence.
6. Confirm `/research/health` continues to report high-risk functions as disabled unless independently authorized and implemented.

## Acceptance and stop conditions
- No operator may mark production complete solely from source commit, PR, or passing unit tests.
- Abort promotion on stale route assets, unexpected redirect, missing receipt, failed tests, provider outage, leaked research inputs, WAF/rate-limit failure or rollback mismatch.
- Do not bypass the existing Human Gate, protected branch policy or the orchestration chain to force deployment.

## Next milestones
- Author identity resolution/verified ORCID link and DOI deduplication.
- Evidence table for primary studies, method/design and theoretical contribution; human-checked references.
- Reproducible statistical workspaces, secure datasets and consent/IRB review before storing real field research.

## Official EKODI recovery and CI renewal (2026-10-30)
- The initial implementation PR #7058 has been superseded, not merged, by EKODI Orchestrator recovery PR #7073.
- Authoritative implementation source is immutable SHA `96cbfa181c3d429ddfa9d494125fc9f0b38bbc87` under task `orch_recovery_96cbfa181c3d429ddfa9d494125fc9f0`.
- GitHub Actions generated `action_required` workflow placeholders after bot-issued PR creation. This **documentation-only** commit on the official recovery branch requests authentic PR CI; no executable code, identity, permission, API key, production flag, payment, rollback or approval policy is changed.
- Prior source CI showed `test` and `EKODI AI Orchestration Gate` status successes, but an earlier draft PR reconciliation step failed on a draft-state guard. Revalidate against the current recovery merge SHA; do not equate past head status with accepted merge status.
- No exact-SHA owner Human Gate approval, protected merge, staging receipt or successful production canary is asserted. Maintain the release stop conditions listed above.
