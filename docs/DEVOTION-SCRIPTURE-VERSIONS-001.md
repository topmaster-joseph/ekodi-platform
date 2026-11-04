# DEVOTION-SCRIPTURE-VERSIONS-001

## Decision and scope

Applies to the shared EKODI daily devotion renderer used by Bible, Church and Mission.

The user can select **개역한글**, **표준새번역**, or **NIV** beside the passage title. The selection persists locally across dates in this browser.

- **KRV1961 (개역한글):** Existing verbatim canonical Bible Core text remains visible and may be narrated in the EKODI page.
- **SAE (1993 표준새번역):** Link to the exact book/chapter on the Korean Bible Society official reader (`version=SAE`), with the first verse when known. The official provider governs any reading or audio features.
- **NIV (2011):** Link to the corresponding chapter on the official YouVersion licensed NIV reader (`/bible/111/{BOOK}.{CHAPTER}.niv`), including its provider-owned audio feature.

**Copyright boundary:** Selecting SAE/NIV never substitutes KRV text, does not transcribe, synthesize, scrape, proxy, cache, republish or send protected biblical text into an LLM. Existing playback stops and the main play button becomes **공식 듣기**, opening the official provider in a new tab via a direct user gesture. If the official reading URL cannot be validated, the play action is disabled rather than reading the wrong translation. No external Bible credentials are stored or exposed.

The official service may offer hearing controls and speed adjustment on its own page. Playback availability, wording, and rights are controlled by the publisher, not by EKODI. The advanced EKODI narration engine and speed sit alongside each other and apply to local KRV only; for SAE/NIV, settings are selected at the official provider.

## Governing source references (checked November 2026)

- Korean Bible Society copyright FAQ: https://bskorea.or.kr/bbs/board.php?bo_table=copyright_faq&device=pc&wr_id=8 (non-commercial use still needs permission)
- Korean Bible Society copyright rights and contact: https://www.bskorea.or.kr/bbs/content.php?co_id=subpage2_3_4_1
- SAE official online reader example: https://www.bskorea.or.kr/bible/korbibReadpage.php?book=1co&chap=4&sec=14&version=SAE
- NIV rights: https://www.biblica.com/permissions/
- NIV official online reader with listening link: https://www.bible.com/bible/111/1CO.4.niv
- API.Bible format/TTS restrictions: https://www.api.bible/terms-and-conditions
- YouVersion official SDK/API requirements: https://developers.youversion.com/overview

**Important:** Non-commercial ministry use alone does not authorize automatic in-site full-text or text-to-speech redistribution. Biblica’s simplified non-commercial site license requires, among other things, no AI features. EKODI's AI-assisted site therefore must not assume it qualifies. Any future inline SAE/NIV text/audio requires verifiable written publisher consent and the officially permitted API/streaming contract. Preserve attributions, stop/rollback controls, publisher restrictions, and contract evidence before enabling. Seek permission as EKODI Mission’s proper legal entity, not as an individual, if a full Bible or corpus license is needed.

## Verification and rollout

- Test the three exact labels and two verified official hosts.
- Never allow an unapproved host, relative URL, missing passage, raw text extraction or KRV TTS under the SAE/NIV selection.
- Test switching while local KRV TTS is playing, returning to KRV, and date/page preference preservation.
- Ensure 320/390/768/1366px layouts: no overflow, three primary playback controls on row one, and narration method and speed in the same advanced row.
- Follow the protected EKODI Orchestrator release workflow and verify the published asset URLs and live public page separately from source tests.
