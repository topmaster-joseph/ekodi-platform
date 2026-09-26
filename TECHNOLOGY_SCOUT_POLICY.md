# EKODI Daily Technology Scout Policy

Status: mandatory ecosystem-wide operational contract  
Policy: TECH-SCOUT-001  
Owner: EKODI Orchestrator

## Mandatory rule
EKODI MUST execute one technology/trend scouting cycle every day. The cycle is owned and scheduled by EKODI infrastructure, not ChatGPT or any external AI provider.

## Authority boundary
External search, OpenAI, feeds and AI providers are replaceable evidence/compute sources only. They cannot change EKODI policy, approve a candidate, create execution authority, mutate production, or deploy.

## Required output
Each candidate records provenance/freshness, EKODI target, expected benefit, implementation difficulty, cost/free-tier impact, security risk, vendor-lock-in risk, operations risk and a recommendation. Material external claims remain subject to AI-KNOWLEDGE-CLAIM-001.

## Decision gate
Daily scouting is mandatory. Applying a discovered candidate is not automatic. A human EKODI authority chooses Apply, Hold or Reject. Apply creates/feeds a governed Orchestrator task; it does not bypass branch, validation, review, guarded deployment or production verification.

## Failure behavior
A failed or degraded daily run is persisted and surfaced to Admin. Failure never silently disables the next scheduled run. Provider failure degrades the scout, not unrelated EKODI services.

## Schedule
Canonical schedule: once daily at 08:00 Asia/Seoul (23:00 UTC), using the existing EKODI-owned shared Cloudflare Cron path. Cloudflare Cron is UTC-based. The collector is isolated behind a replaceable service binding.
