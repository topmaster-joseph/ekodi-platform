# EKODI native automation handoff — post-cutover snapshot (2026-10-30)

EKODI Orchestrator is the **sole planned owner** of the registered native
monitoring and approved-source preparation schedules. Issue #6895.

## Live vs historical status

The authorized ChatGPT Automations tool was queried **after** the five
recurring tasks were stopped on 2026-10-30: **25 records total, zero enabled**.
That exact check does not prove that native jobs performed every replacement.

Five formerly recurring workloads are now registered by the already-existing
EKODI `EKODI Native Operations Watch` through canonical merged PR **#7044**:
1. Church Naver ownership, canonical redirect and indexing evidence
2. Social account release and authenticated UI E2E
3. Church Live studio and anonymous viewer release E2E
4. Human Publishing monthly six-slot preparation
5. Church Wednesday 08:26 KST worship Scripture/Docs/Slides readiness

The previous Mission homepage monitor was **already inactive** at the last
legacy transition; its independent issue #6875 remains relevant but it is
*not* among the five paused and registered tasks.

An imported ChatGPT snapshot in `scripts/ekodi-native-migration-status.mjs`
records **activeTaskCount=0** after the verified pause and
**previouslyActivePausedCount=5**. It is a **historical, non-live source**.
The GitHub/Cloudflare native runtime cannot query ChatGPT scheduled tasks
through any authenticated, trusted API used by these scripts. Never assert
that it can or use this historical snapshot to stop or re-enable tasks.

## What is genuinely live

- Existing EKODI Operations Watch is scheduled and has recorded genuine
  GitHub Actions evidence artifacts, including occasional correctly failed
  health alerts. A failed health alert is not a failed schedule trigger.
- Official #7044 merged its native `config/ekodi-native-reservations.json`,
  `scripts/ekodi-native-reservations.mjs` and the same watch's two KST
  weekly cron entries, with exact-head CI and protected merge.
- #6920 cutover admission, #6934 health evidence, #6988 approved-source
  readiness, #7015 offline private EPUB builder are merged.
- Native 5-task registered observation **does not write actual Docs,
  slides, manuscripts or a published book**. Each individual task remains
  `actualWorkDelivered=false` / `cutoverParityVerified=false` until
  authenticated source, real artifacts and human signoff are verified.

## Remaining gates

- Verify a real **post-#7044** GitHub `schedule` run artifact containing
  `ekodi-native-reservations-evidence.json`. No such run can be inferred
  from an older operations-watch success artifact.
- Weekly editorial/worship special cron should not invoke the redundant
  hourly GitHub API health scan, to protect GitHub installation quota.
- The Google Docs/Slides worker #7002 requires an actual EKODI token broker,
  private folder, authorized pastor, D1 ledger and real document readback.
- The offline EPUB3 builder #7015 requires a private author-approved
  manuscript, real EPUBCheck/Ace, rights/accessible/audiobook QA and
  publisher Human Gate; no actual sales or release is implied.
- Naver ownership confirmation is provider-side; a public verification
  file URL alone does not prove Naver search indexing or completed site
  ownership.
- Do not create another scheduler, bypass required CI, distribute a paid
  product, impersonate an approved user, or claim that ChatGPT tasks remain
  enabled. Verify EKODI output before declaring business continuity.

Central #6890 standalone shadow scheduler was closed unmerged after #7044
replaced it, preventing duplicate weekly schedules.
