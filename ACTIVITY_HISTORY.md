# EKODI Activity History Ledger

## Purpose
EKODI keeps recurring meetings, one-off events, camps, campaigns, and other activities in one chronological history while preserving the evidence used to reconstruct older records.

## Source precedence
1. Current EKODI canonical activity/person ledgers
2. Explicitly confirmed administrator records
3. Google Drive documents and sheets as durable evidence
4. Website/import evidence
5. ChatGPT memory or conversation context as reviewable reference evidence only

A lower-priority source never overwrites a higher-priority value automatically. Conflicting dates, times, attendance, venues, or titles are stored as needs_review or conflict evidence.

## Data model
- activity_series: recurring activity identity and cadence, such as Saturday Gathering.
- activities: each actual or candidate occurrence.
- activity_evidence_sources: Drive, EKODI, GPT-context, website, import, or manual evidence with verification state.
- activity_participations: person-level participation where known.

## Workspace administration
Any root workspace whose operator role has the activity capability can use /<workspace>/admin/activity-history. The timeline shows recurring series, attendance when known, and source evidence. Operators may add a recurring series or a historical occurrence, but imported plans remain reviewable until actual execution is confirmed.

Mission keeps participant/application management separately at /ekodimission/admin/activities. Historical records without active registration or participants do not pollute that participant picker.

## Initial reconstruction
The first seed uses verified/reviewable evidence already available in Drive:
- 2026-09-20 bulletin: recurring Saturday 11:00 gathering and prior-week attendance 10.
- September Saturday Gathering plan: 9/5, 9/12, 9/19, 9/26 plan dates; planned dates are not treated as completed by plan alone.
- 2026 Chuseok Open Table documents: the current EKODI event remains canonical; a Drive time difference is retained as conflict evidence.
- Summer Camp: Drive 8/21-22 and ChatGPT context 8/21-23 are retained as a conflict requiring confirmation.
- Church recurring series: Sunday 11:00, daily prayer 23:30, and Sunday praise 17:00 are recorded from repeated bulletins.
- Church Sunday attendance history is backfilled only where a following bulletin explicitly reports Last week's statistics; recurring prayer/praise statistics are not expanded into invented per-day occurrences.

This model is intentionally additive. It does not convert attendance into membership, church membership, donor, volunteer, partner, or staff relationships.
