# EKODI BOOKS Multi-platform Publisher Agent

Local browser operators for EKODI BOOKS publishing through Google Play Books, Amazon KDP, and 유페이퍼.

## Why local

Publisher dashboards are authenticated browser workflows. The agent runs on the publisher's own computer so passwords, cookies, 2-step verification, tax data, banking data, and payment data do not pass through EKODI servers.

Each platform uses a **separate automation-only Chrome profile**. The agent never asks for or stores platform passwords. On the first run, complete sign-in and any 2-step verification in the Chrome window opened by the agent. The platform profile can then be reused locally.

## Safety contract

- No password storage.
- No authenticated publisher session upload to EKODI.
- No use of the user's normal Chrome profile.
- No silent final publication.
- Google final Publish requires both `--publish` and `--approve-title`, with an exact title match.
- Amazon KDP stops before publishing-rights / AI disclosure attestations unless the workflow has explicit approved manifest data and a reviewed implementation for the current KDP screen.
- 유페이퍼 stops before final 판매신청 until seller, settlement, and identifier status are verified.
- Every operation writes a local JSONL audit trail to `~/.ekodi/books-publisher-audit.jsonl`.
- If an external publisher changes a required screen or field, the run blocks instead of guessing.

## Setup

Requires Node.js 20+ and Google Chrome.

```bash
cd tools/books-publisher-agent
npm install
```

Put approved EPUB and cover assets under `examples/files/` when using the included manifests.

## Dry-run validation

```bash
npm start -- --platform google --manifest ./examples/ekodian.json --dry-run
npm start -- --platform kdp --manifest ./examples/ekodian-kdp.json --dry-run
npm start -- --platform upaper --manifest ./examples/ekodian.json --dry-run
```

## Google Play Books

Prepare through Review:

```bash
npm start -- --platform google --manifest ./examples/ekodian.json
```

Publish after exact title approval:

```bash
npm start -- --platform google --manifest ./examples/ekodian.json --publish --approve-title "에코디언을 찾아서"
```

The Google adapter attempts:

`Book Catalog → Add Book → Sell ebook → GGKEY/ISBN → Book Info → Content upload → Pricing → Review → optional Publish`

## Amazon KDP

The included English manifest is `examples/ekodian-kdp.json` and contains the approved English title, description, USD 5.99 price, EKODI ORIGINAL series data, seven keywords, category directions, rights ownership, and AI-generated-translation disclosure.

```bash
npm start -- --platform kdp --manifest ./examples/ekodian-kdp.json
```

The KDP adapter signs in through the isolated Chrome profile and begins the Kindle eBook title setup. It deliberately stops at declarations/final submission rather than silently making legal attestations. The approved manifest is retained for the next hardened KDP form adapter.

## 유페이퍼

```bash
npm start -- --platform upaper --manifest ./examples/ekodian.json
```

The 유페이퍼 adapter opens the seller admin, prepares a new content draft, fills available metadata and attempts EPUB/cover upload. It stops before 판매신청 so seller conversion, settlement information, and ISBN/UCI state can be verified.

## EKODIan release assets

Korean edition:
- `에코디언_EKODI_BOOKS_FINAL_v1.3.epub`
- `에코디언_표지_FINAL_1600x2560_300dpi.jpg`

Amazon English edition:
- `In_Search_of_the_EKODIan_KDP_RC1.epub`
- `In_Search_of_the_EKODIan_KDP_Cover_FINAL.jpg`

## Operating direction

The local operator is the credential-safe execution adapter. EKODI Books can issue signed publish jobs containing approved metadata and downloadable release assets, while the local agent performs the authenticated browser work and reports only operational status and public book identifiers back to the EKODI administration layer.
