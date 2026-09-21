# EKODI Domain and Public Address Standard

`ekodi.kr` is the single canonical public HTTP origin for EKODI.

## 1. Public address rule

All EKODI-owned public web surfaces use apex paths:

- Site: `https://ekodi.kr/{site}`
- Site admin: `https://ekodi.kr/{site}/admin`
- Site service: `https://ekodi.kr/{site}/{service}`
- Site service admin: `https://ekodi.kr/{site}/{service}/admin`
- Platform admin: `https://ekodi.kr/admin`
- Platform API: `https://ekodi.kr/api`
- MCP: `https://ekodi.kr/mcp`

An independent site owns one first-level path. Independent sites are not nested under another independent site.

## 2. Zero-subdomain public policy

EKODI does not use public subdomains for user-facing sites, compatibility aliases, or redirects.

A hostname must never exist only to redirect people, search engines, or AI agents to another EKODI URL. Legacy redirect-only routes are retired instead of preserved as permanent redirects.

Internal execution may use private service bindings or private Workers. Those internal addresses are implementation details and must not become public navigation, canonical metadata, sitemap entries, `llms.txt` resources, or user-facing links.

## 3. Existing and customer-owned domains

Customer-owned domains may be connected as direct public domains when the customer retains ownership and the mapping is explicitly approved. They are not EKODI subdomain aliases and must not become authorization identifiers.

When a legacy EKODI-owned public hostname is retired, the canonical EKODI path remains the source of truth. Do not create a new redirect-only hostname as a compatibility layer.

## 4. Mail identity

Email-address domains and public web routing are separate concerns. MX, SPF, DKIM, DMARC, aliases, and Google Workspace configuration may use the domains required for mail identity, but that does not create a public HTTP subdomain or redirect contract.

Browser mail access should be linked from the canonical EKODI path or the mail provider directly rather than through an EKODI redirect-only hostname.

## 5. Canonical site boundaries

Current canonical examples include:

- EKODI Biz: `https://ekodi.kr/ekodibiz`
- EKODI Mall: `https://ekodi.kr/ekodimall`
- Church: `https://ekodi.kr/ekodichurch`
- Lab: `https://ekodi.kr/ekodilab`
- Trading service: `https://ekodi.kr/ekodibiz/trade`
- Store workspaces: `https://ekodi.kr/jadam`, `/pizzamaru`, `/yogurt`
- CGMA workspace: `https://ekodi.kr/cgma`

The authoritative machine-readable policy is `config/domain-canonical-policy.json`. The Zero-Subdomain Guard rejects changes that introduce new EKODI public subdomains.
