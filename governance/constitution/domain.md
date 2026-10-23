# Domain Constitution — Apex Web Only

1. The only canonical first-party EKODI production web hostname is `ekodi.kr`. Public, personal, administration, authentication, API and service pages use `https://ekodi.kr/<path>`. New first-party web subdomains are forbidden.
2. Person, Workspace and tenant identity is immutable `workspace_id` and never inferred from a host, slug or path. Canonical user home is `/my`, platform administrator is `/admin`, tenant administrator is `/{slug}/admin`.
3. Distinct Workers/Pages/services retain independent permissions, data and deployment through apex path routing and private Service Bindings. One origin does not imply shared authorization.
4. Former `legacy EKODI web subdomains` web hosts are retirement candidates, not permanent redirects. Update all links, OAuth and webhook callbacks and pass production verification before removing Custom Domains and HTTP DNS.
5. Protect email MX/SPF/DKIM/DMARC and verification DNS separately. Customer-owned domains remain under separate ownership. Protected development `workers.dev` hosts are staging/rollback, never canonical production entry.
6. Structural changes require C3 owner approval, staged evidence, reversibility and guarded deployment. See `config/domain-canonical-policy.json` and `docs/DOMAIN-NAMING.md`.
