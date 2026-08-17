# Marketing Ledger rollout

1. Validate JS contracts and additive migration policy.
2. Apply all D1 migrations to the isolated Control API staging database.
3. Deploy the Control API staging Worker and verify existing auth/security boundaries.
4. Merge only after Marketing Ledger CI, MarketingAI Admin CI, Control API staging and repository CI succeed.
5. Production workflow captures a D1 Time Travel bookmark before applying migrations.
6. Deploy candidate at 0%, verify, promote, run deep verification, then record the recovery point.
7. Admin UI remains read-only. No synthetic customer/campaign activity is seeded.
