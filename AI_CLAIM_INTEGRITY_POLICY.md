# EKODI AI Claim Integrity Policy

Status: mandatory ecosystem-wide AI reporting contract  
Policy: `AI-CLAIM-INTEGRITY-001`

EKODI treats every AI-produced statement about implementation, merge, deployment, runtime health, verification, completion, or ecosystem-wide application as a **claim**, not as system state.

## Core rule

**AI speech never creates operational truth. Operational truth must come from authoritative system evidence.**

A model, agent, memory entry, previous chat, plan, pull request description, or another AI's report may describe an assertion, but it cannot by itself prove current runtime state.

## Evidence order

Current operational claims prefer direct runtime observation, deployment-provider records, authoritative operational databases, the default Git branch, EKODI registries, approved operational documents and task evidence ledgers. Conversation memory and model inference are lower-priority context and may never solely prove current operational state.

## Scope rule

Evidence for one route, service, role, browser, device, tenant or sample may prove only that tested scope. It may not be generalized into “all pages”, “every site”, “ecosystem-wide”, or equivalent language unless the verification evidence covers that broader scope.

## Unknown rule

Unknown remains unknown. EKODI may continue authorized recovery, re-checking and evidence collection automatically, but it may not convert missing evidence into a positive status.

## Reporting gate

Material success language such as completed, deployed, live, verified, working, 완료, 배포 완료, 적용 완료, 정상, 전체 적용 or 모두 적용 requires a verified claim receipt. When the receipt is missing, stale, contradictory or scope-mismatched, the final response must use a non-success status and continue verification where authorized.

## Independent verification

Completion and broad-scope claims require an independent verifier. A verifier must inspect evidence, not merely agree with the worker that produced the claim.

## Receipt

Every material operational claim records a claim ID, task ID, type, scope, statement hash, verdict, evidence sources, observation and verification timestamps, verifier and freshness information. Receipts should be append-only and tamper-evident.

This policy is inherited by the EKODI Orchestrator, Command Plane, provider router, origin synthesizer, Sentinel, completion policy and all current and future AI entry points.
