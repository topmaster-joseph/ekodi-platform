# Marketing Ledger API v1

All endpoints require a confirmed EKODI Marketing workspace member token. Store writes require a store-manager role. Tenant access requires a tenant-level manager role.

## Read workspace CRM/campaign state
`GET /api/marketing/ledger/overview?workspaceType=store|tenant&workspaceKey=...`

Returns template, campaign states, aggregate CRM segments and recent events without customer keys.

## Record an event
`POST /api/marketing/ledger/events`

Body fields: `workspaceType`, `workspaceKey`, `eventType`, optional `customerRef`, `channel`, optional `campaignId`, `valueKrw`, `quantity`, `consentScope`, `source`, optional stable `externalRef`, optional `occurredAt`.

`customerRef` is normalized only in memory and stored as a workspace-salted SHA-256 pseudonym. Arbitrary metadata is not persisted.

## Create a campaign draft
`POST /api/marketing/ledger/campaigns`

Body fields: `workspaceType`, `workspaceKey`, `name`, `objective`, `audienceSegment`, `channel`, `offerSummary`.

The campaign is always created in `draft`.

## Request campaign human review
`POST /api/marketing/ledger/campaigns/{id}/review`

Creates an AI Mission Control action with `human_gate` / `awaiting_human` and changes the campaign to `review`.

There is intentionally no publish, send, execute or approve endpoint in this API.
