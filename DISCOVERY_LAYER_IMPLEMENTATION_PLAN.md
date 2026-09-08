# EKODI Discovery Layer Implementation Plan

Status: in progress

This branch restores and upgrades the platform-wide discovery foundation for SEO, AEO, GEO/LLMO, structured data, crawler policy, and automated validation.

## Goals
- Platform-level robots and sitemap support
- Canonical URL and metadata contract
- JSON-LD structured data helpers
- AEO/GEO content and entity conventions
- AI crawler policy guidance
- CI-friendly validation and documentation
- Site-level override points without breaking common defaults

## Guardrails
- Public pages only are discoverable by default
- Authenticated/admin/system routes must not be indexed
- Canonical URLs must resolve to production origins
- Structured data must reflect visible content and verifiable entities
- AI crawler access must not expose private or tenant-restricted content
