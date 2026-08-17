# Operations

Marketing ledger activity is workspace-scoped, idempotent by source/external reference when available, and rate-limited as a sensitive mutation. Operational sources should map only facts required for CRM/campaign measurement and avoid copying source-system customer PII into the central ledger.
