# EKODI stock narrator: November 3, 2026 checkpoint

This is a second, non-cloning TTS option for the shared Bible / Church / Mission daily devotion. It uses Supertone Supertonic 3 built-in M4 (male) and F5 (female) Korean styles, not existing private voice sample recordings.

Engine: supertonic==1.3.1 (MIT code); stock model: OpenRAIL-M weights, pinned revision 724fb5abbf5502583fb520898d45929e62f02c0b. This model was archived in 2026; do not assume ongoing vendor maintenance. A release must include accurate synthetic voice disclosure and model license review.

An already-public devotion script is exported with `export-devotion-script.mjs`. The renderer `render-preset-devotion.py` checks date and exact source SHA256 before generating distinct offline private male/female MP3 drafts. The local file `review-local.html` is made by `build-preset-review-page.mjs` and presents both voices for careful listening, including full Scripture reading and prayer.

2026-11-03: 22 segments; passage 고린도전서 4:1-13; source SHA256 78737b05844d87542e4eadc23ecd6689ab969a1fa7ea1fdd77f647a4208003fa. Generated male M4 length 194.98 sec, SHA256 7b17b75e848d75ad16df81ba7adbf32d337abac0d5d99bf51720b4bfc96eafcb; female F5 length 201.39 sec, SHA256 36a6ded0cd1bcd54a6c2162cd19fdac8e8842b391858d90b2b959a7e6b1b173d. Both files are mono MP3 at 44.1kHz / 128kbps. Technical audio levels were measured; human listening quality is not yet certified.

The protected publisher `approve-devotion-narration.mjs` requires explicit model terms acknowledgment, review of stock voice rights, an accurate synthetic disclosure, exact audio hashes, and independent human evaluation of pronunciation, Scripture fidelity, completeness, quality and accessibility. It does not accept a generic owner authorization as a substituted audio QA approval. The prior private-speaker route remains unchanged and requires its separately documented speaker rights. Missing review means no approved manifest and no public audio.

Run private audio export, stock voice draft generation, then local review-page generation. Only after genuine independent audio QA can the final files be proposed via an EKODI Orchestrator protected PR, followed by mobile/desktop live checks. Do not directly copy draft MP3s into public source or deploy from a task branch.
