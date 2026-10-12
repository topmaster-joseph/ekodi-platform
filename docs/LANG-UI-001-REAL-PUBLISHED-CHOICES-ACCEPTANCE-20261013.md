# LANG-UI-001 — authoritative published choices and bounded EKODIBIZ proof

## EKODI owner authorization and recovery
- Original source PR #4498, exact user-approved source SHA `1de56b5a4544beedd1f3559b49ec70540cff095e`.
- Explicit owner approval: https://github.com/topmaster-joseph/ekodi-platform/pull/4498#issuecomment-6134299782.
- Official EKODI D1-backed recovery task: `orch_recovery_1de56b5a4544beedd1f3559b49ec7054`.
- Recovery workflow [#38320191339](https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38320191339) created the issued branch from the exact SHA; GitHub Actions PR creation was denied HTTP 403, so the authorized repository owner's connected GitHub identity opened integration PR #4500 on the unchanged branch.
- Original PR #4498 was closed without merge to avoid parallel competing release candidates.

## First-party read-only browser proof
- Source run: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38320156091.
- Artifact: https://github.com/topmaster-joseph/ekodi-platform/actions/runs/38320156091/artifacts/11779056372.
- Synthetic 10-state readiness/offline/error recovery: PASS. Real page observations:
  - EKODI root `pass / single_locale_hidden`, language API HTTP 200.
  - Journal mobile `pass / single_locale_hidden`, language API HTTP 200.
  - SeonamMedi independently owned Korean-only header `pass / independent_korean_only_header`; does not pretend to run the shared Shell.
  - EKODIBIZ `inconclusive / shared_shell_or_header_not_observed` with no observed status API request; **not** evidence of actual multilingual release.
  - `liveCertified=false`, `liveDriftCount=0`.
- New acceptance gate rejects a page's local selector options and ready language list when they are mutually consistent but do not equal authoritative API `publishedLocales`. Actual multi-language certification requires a genuine live API state with >=2 published locales and an accessible rounded header control with exactly matching options.
- A single bounded additional page `/ekodibiz` is visited per execution using ephemeral EKODI-owned Chromium, read-only HTTP methods, no user credentials; HTTP 429 stops further visits.

## Guarded integration and remaining conditions
This documentation-only owner-authored commit requests the existing `converge-orchestrated-pr-merge.yml` on the officially issued branch. The script change is read-only diagnostic; do not publish unready translations, force a multi-language switch, disable 429 restrictions, or bypass protected checks. Exact-source Human Gate and native Chromium CI are mandatory.

Related [issue #4365](https://github.com/topmaster-joseph/ekodi-platform/issues/4365) remains open until a real shared-shell public service actually has >=2 API-published locales and its options are verified. EKODIBIZ may separately need a site-owned header/Shell integration investigation, but no unsupported claim is made about its readiness.
