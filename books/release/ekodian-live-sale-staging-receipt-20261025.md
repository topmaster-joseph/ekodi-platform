# Books staging receipt repair replay — 2026-10-25

This release marker exists so the guarded Books lane is replayed after repairing
the reusable staging receipt propagation.

- Previous protected live-sale merge: `6401cd138a42f907831fc1a7b36409efa32cce6b`
- Dispatcher repair merge: `34b7c43d8dd2ef847af7dbd8234278127841bc01`
- Previous deployment run: `40149094300`
- Failure: staging release validation saw checkout branch `main` instead of the verified orchestrator receipt.
- Expected result after this repair: staging gate receives the recovery branch/task, guarded Books production release promotes current main, and production deep verification proves the `BOOK-EKODI-000001` UPaper purchase CTA.
