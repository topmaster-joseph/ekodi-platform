# EKODI EPUB3 master technical preflight — EPUB-MASTER-PREFLIGHT-001

Central owner: EKODI Orchestrator, publishing issue #6331. A read-only companion to scripts/verify-audiobook-master.mjs with no external dependencies or API fees.

## Purpose

Check candidate EPUB files privately before the author/publisher release approval, without copying manuscripts to GitHub or sending them to an outside API. Emit only a public book/edition ID, SHA-256 digest, limited package metrics, and blockers.

An operator prepares a private expected edition JSON with bookId, edition and optionally sha256 from an independently approved immutable edition. A newly drafted file may omit sha256 for first inspection, but the computed digest is not an approval signature and must be signed and bound to the exact edition before public release.

Run from the repository root:

    node scripts/verify-epub-master.mjs --epub /private/book.epub --expect /private/edition.json --out /private/epub-preflight.json
    node --test test/epub-master-preflight.test.mjs

## What is checked

- EPUB ZIP structure and resource integrity (all files CRC32, decompression and size limits).
- Stored first mimetype entry, META-INF/container.xml, valid OPF path and EPUB 3 declared version.
- Declared title and language, manifest resources, XHTML nav element and spine references.
- Nonduplicate and safe resource paths, no traversal, symlinks or encrypted ZIP entries.
- Optional expected SHA-256 comparison against the entire byte-identical file.

Limits: 50 MiB EPUB, 2,000 ZIP entries, 40 MiB per uncompressed resource and 180 MiB total.

## What is NOT checked

Passing technicalStatus does not prove XML/schema conformance, EPUBCheck or Ace by DAISY, semantics, embedded accessibility, full textual accuracy, cross-device rendering, rights, authorship, the identity of the digest approver, any actual audiobook, payment, or distribution. This is a conservative structural scan, not a replacement for a formal EPUB validator.

releaseReady is deliberately false in all cases. Remaining gates: official EPUBCheck/Ace validation; human reader and accessibility tests; independent author/publisher/rights approval; licensed and fully listened same-edition audiobook; signed Books/Mall release, purchase and refund E2E.

All original books, edition rights, payment MID, orders, contracts and operational databases are untouched. Output reports are written with exclusive file creation and are never overwritten. Keep local EPUB and identity records private.

Parallel ownership: PR #6638 scheduled private release, #6679 editorial workflow, #6718 storefront release guard. This technical preflight does not modify any of their files or claim their execution gates.
