# EKODI Seasonal Workforce Portal — phase 1

Canonical proposed route: `/ekodibiz/seasonal-workers/`.

This directory contains the initial **public demonstration** page for a proposed municipal seasonal workforce management portal. It does not perform recruitment, worker placement, visa decisions or government allocations.

## Implementation scope
- Public introduction to municipal agricultural workforce coordination
- Farm demand survey **demonstration only** (no submission, no personal data collection)
- Municipality and partner cooperation information
- Role-based dashboard requirements and MOU document-management roadmap

## Deployment guardrails
The HTML in this directory is a standalone prototype. Integrate it with the existing EKODI Business router and shared authentication, authorization, CSP and design system before exposing the route. Do not replace an existing route or alter central login callbacks.

Do not enable production form submission before a lawful operator, purpose, retention period, consent/notice, authenticated backend, RBAC, tenant isolation, audit logs and incident response are verified.

Do not enable private recruitment, selection, dispatch or fee collection. Such actions require legal authorization and designated public entities.

## Acceptance criteria
- PC/mobile responsive rendering
- No external scripts, no personal information storage
- All public links remain within the intended route
- Government allocation and immigration decisions are never represented as EKODI capabilities
- Staging + authenticated Chromium tests and protected CI before production release
