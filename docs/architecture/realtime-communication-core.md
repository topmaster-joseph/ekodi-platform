# EKODI Real-time Communication Core

Status: implementation baseline

## Purpose
Provide a tenant-neutral, browser-first real-time communication foundation for live broadcasting, meetings, interpretation, recording, and multistream distribution without coupling media failures to the EKODI web/control plane.

## Architecture

- Control Plane: identity, room policy, entitlements, billing, audit, consent.
- Media Plane: WebRTC/WHIP ingest, SFU relay, adaptive bitrate, reconnect, TURN.
- AI Plane: speech recognition, translation, TTS, captions, provider failover.
- Recording Plane: chunked server-side recording, signed access, retention.
- Distribution Plane: outbound RTMPS/SRT destinations with independent retry/circuit breakers.
- Observability Plane: health, jitter, packet loss, bitrate, translation latency, recording state, destination state.

## Security invariants

1. Tenant and room boundaries are enforced server-side.
2. Media/session credentials are short-lived and scoped to one room and role.
3. No provider API key or stream key is returned to browsers.
4. Recording and AI processing require explicit room policy and participant notice.
5. High-security E2EE rooms disable server-side AI processing and recording.
6. Every privileged room action is audit logged.
7. Provider failures are fail-isolated: original media remains available whenever possible.
8. New providers or runtime changes must pass staging, security, load, recovery and production-verification gates before promotion.

## Room modes

- public_broadcast
- webinar
- meeting
- interpretation
- consultation
- education
- worship
- commerce

## Security profiles

- standard: encrypted transport + optional AI + optional recording.
- restricted: invite-only, stronger admission controls, AI/recording individually governed.
- e2ee: end-to-end media protection; server-side AI and recording disabled.

## Role model

owner > cohost > presenter > participant > viewer

Roles are capabilities, not tenant rank. Platform administrators retain emergency governance but do not bypass audit.

## Failure policy

- Translation outage: keep original audio/video live.
- Recording outage: keep live session running and surface degraded status.
- One destination outage: keep all other destinations and EKODI Live active.
- Admin/control UI outage: existing media sessions should continue until lease expiry/recovery.
- Provider outage: route only within the same entitlement/privacy boundary.

## Delivery sequence

1. Control-plane contracts and database schema.
2. Browser room UX and short-lived session tokens.
3. Media-plane adapter interface plus development simulator.
4. AI interpretation adapter interface and demand-activated language channels.
5. Recording/distribution adapters.
6. Live health and usage ledger.
7. Staging load/recovery drills.
8. Guarded production rollout and operational verification.
