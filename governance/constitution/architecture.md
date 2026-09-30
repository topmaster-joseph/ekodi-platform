# Architecture Constitution
1. EKODI Core is the source of truth for platform identity, tenant, authorization and business state.
2. Modular monolith first; split only for measured scale, security or isolation.
3. Queue heavy/retryable work; external providers remain integrations.
