# EKODI audiobook master technical preflight

Task: `chatgpt-6331-audio-20261029` · EKODI Orchestrator issue #6331.

This independent validator **does not generate narration, approve rights, publish,
upload to R2, charge, or grant buyer entitlements**. It cannot prove that an MP3
fully decodes or that every spoken line matches the approved ebook.

## Operator usage

After the author and publisher freeze the actual ebook edition, privately prepare
chapter MP3 assets and a **local** manifest:

```json
{
  "bookId": "BOOK-EKODI-000001",
  "edition": "Digital First Edition · v1.7",
  "chapters": [
    { "number": 1, "title": "Chapter one", "file": "01.mp3" },
    { "number": 2, "title": "Chapter two", "file": "02.mp3" }
  ]
}
```

```sh
node scripts/verify-audiobook-master.mjs \
  --catalog books/books.json \
  --submission /private/track-manifest.json \
  --root /private/audiobook \
  --out /private/audiobook-preflight.json
node --test test/audiobook-master-preflight.test.mjs
```

The script checks the catalog identity and exact frozen edition; ordered chapters;
local file containment (including symlinks); MP3 header, size limit 32 MiB/chapter,
and SHA-256 fingerprints. Output contains chapter metadata and hashes but no
private paths, manuscript, audio content or buyer data. The optional output must
be a NEW file (no overwrites) and should stay private.

`technicalStatus: passed` indicates only these limited technical checks.
`releaseReady` is **always false**. Independent human full-file listening, audio
decode/playback, content completeness, legal commercial voice and quoted-material
rights, voice quality, author/publisher/accessibility signatures, protected matching
edition, private R2 track metadata, and purchase/refund authorization E2E remain
mandatory. Missing these blocks release; this helper NEVER self-approves.

Existing two catalog books and order/finance/entitlement databases are untouched.
No conflict with the owner-controlled draft work: #6638 (private scheduled
release), #6679 (editorial approvals), #6718 (storefront access guards).
