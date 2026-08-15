# EKODI BOOKS Google Publisher Agent

A local browser operator for publishing EKODI BOOKS titles through the Google Play Books Partner Center.

## Why local

Google Partner Center publishing is an authenticated browser workflow. This agent intentionally runs on the publisher's own computer so Google credentials, cookies, 2-step verification, and payment data do not pass through EKODI servers.

The agent uses a **separate automation-only Chrome profile**. It never asks for or stores a Google password. On the first run, complete Google sign-in and any 2-step verification in the Chrome window that the agent opens. The profile is then reused locally.

## Safety contract

- No password storage.
- No Google session upload to EKODI.
- No use of the user's normal Chrome profile.
- No silent final publication. The default flow stops on Review.
- Final Publish requires both `--publish` and `--approve-title`, and the approved title must exactly match the manifest title.
- Every operation writes a local JSONL audit trail to `~/.ekodi/books-publisher-audit.jsonl`.
- If Google changes a required screen or field, the run blocks instead of guessing.

## Setup

Requires Node.js 20+ and Google Chrome.

```bash
cd tools/books-publisher-agent
npm install
```

Put the final EPUB and cover into `examples/files/` when using the included EKODIan manifest.

## Validate without opening Google

```bash
npm start -- --manifest ./examples/ekodian.json --dry-run
```

## Prepare a book and stop at Review

```bash
npm start -- --manifest ./examples/ekodian.json
```

On the first run, sign in to Google in the automation Chrome window. The agent then attempts:

`Book Catalog → Add Book → Sell ebook → GGKEY/ISBN → Book Info → Content upload → Pricing → Review`

## Publish after explicit approval

```bash
npm start -- --manifest ./examples/ekodian.json --publish --approve-title "에코디언을 찾아서"
```

This is the only mode that allows the final Publish click.

## Current Google flow assumptions

The operator uses accessible names and bilingual Korean/English text rather than CSS class names. This is less brittle than styling selectors, but Partner Center is an external UI and can still change. Any missing required action is treated as a blocked run and recorded in the audit log.

## Next platform integration

The local operator is the execution adapter. EKODI Books should later provide a signed publish job containing approved metadata and downloadable release assets. The local agent can then consume that job, execute Google publishing, and report only operational status and public identifiers back to `admin.ekodi.kr`, without sending Google credentials or browser cookies to the server.
