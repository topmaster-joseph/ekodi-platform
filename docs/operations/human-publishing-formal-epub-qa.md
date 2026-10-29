# EKODI Formal EPUB QA — private, offline EPUBCheck + DAISY Ace

Owner: EKODI Orchestrator · #6331 · task `chatgpt-6331-formal-epub-qa-20261029`.

## Purpose

The existing `scripts/verify-epub-master.mjs` performs a *limited* EPUB3
container and digest check. This additional operator CLI invokes the **locally
installed official EPUBCheck** and **locally installed DAISY Ace** to validate
a private frozen master. No `npx --yes`, network download, document upload,
AI API, subscription, store publication, payment, or privileged production
connection is executed.

Before invoking either external tool, it runs the local container validator and
requires an **exact previously pinned SHA-256 digest** for the approved
edition. If the content is different or the structural check blocks, external
validation does not run. The digest is checked again after all tools complete.

## Usage

Install EPUBCheck and Ace on an authorized operator/ephemeral staging machine
according to their upstream instructions. Keep all binaries and secrets outside
the Git repository. Configure an operator-approved private working directory.

```json
{
  "bookId": "BOOK-EKODI-000001",
  "edition": "Digital First Edition · v1.7",
  "sha256": "<64-digit SHA-256 of the exact private EPUB master>"
}
```

```sh
node scripts/verify-epub-formal-qa.mjs \
  --epub /private/immutable-master.epub \
  --expect /private/approved-edition-digest.json \
  --epubcheck-bin epubcheck \
  --ace-bin ace \
  --out /private/qa-report.json

node --test test/epub-formal-qa.test.mjs
```

EPUBCheck uses `epubcheck --json <temporary-json> <epub>`. Ace uses
`ace --outdir <temporary-dir> <epub>`, and the generated `report.json` is
read. Tools execute **sequentially**, with fixed positional arguments and
`shell:false`, bounded runtime and report files. Tool output is deliberately
not included in the small summary (it can contain raw text, identifiers, internal
paths and manuscript excerpts). A temporary private folder is removed after
verification, even for failed runs.

This assumes the official CLI executables are already available in the operator
process PATH or supplied by vetted executable path. If missing, nonzero, timed
out, returning malformed reports, warnings/errors or accessibility violations,
the job blocks. Ace can exit 0 when it found accessibility violations, so its
JSON assertions must be examined independently. DAISY Ace missing-accessibility-
metadata fields are reported to the human reviewer but automated success never
substitutes for actual disability/accessibility testing.

## Outcome contract

- `technicalStatus = blocked`: no publication or sales authorized.
- `technicalStatus = passed_automated_only`: both official automated
  validators returned recognized reports without listed violations, AND the
  same frozen byte digest was observed before and after. **Still not a release.**
- `releaseReady = false` **unconditionally**. No client, job or publisher may
  convert this local report to authorization. Only protected source-of-truth
  approvals, verified commercial rights, independent human listening and
  accessibility review, exact-edition approved audio master, seller signoff
  and verified Books/Mall purchase/refund entitlements can authorize release.

For the two current books, this command needs an actually approved EPUB file
and its operator-issued matching digest. It cannot prove that either stored
edition is already available or that a production sale has completed. Raw
EPUB files, private author manuscripts, and generated QA reports must stay
out of public GitHub and public R2.

## Upstream tool references

- EPUBCheck CLI: https://www.w3.org/publishing/epubcheck/docs/cli/
- EPUBCheck JSON report: https://w3c.github.io/epubcheck/docs/report/
- Ace CLI: https://daisy.github.io/ace/docs/cli/
- Ace JSON report: https://daisy.github.io/ace/docs/report-json/

Related independent owner-controlled drafts: #6679 (editorial approval),
#6638 (private schedule/dual-channel handoff), #6718 (storefront safety).
Do not enable their sales gates merely because this QA tool reports automated
technical success. Existing DB, legacy catalog, orders, prices and MID remain
unmodified.
