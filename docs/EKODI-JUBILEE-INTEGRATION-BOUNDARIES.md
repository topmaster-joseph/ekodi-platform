# EKODI Jubilee Integration Boundaries

Status: implementation contract for cross-service adoption
Policy version: `1.0.0`

## 1. One policy, many entry points

Jubilee is not an AI provider, recommendation catalog, welfare classifier or customer-facing product. It is the shared policy boundary applied after candidate discovery and before a consequential recommendation or connection is executed.

```text
Google / ChatGPT / Gemini / Claude / other AI
EKODI Search / Mall / People / Support / Community
                    |
                    v
              candidate discovery
                    |
                    v
          runJubileePolicyGate(...)
                    |
       +------------+-------------+
       |            |             |
       v            v             v
  more search     present      human review
   required        choice       required
                    |
                    v
              user selection
                    |
                    v
      authorizeJubileeSelection(...)
                    |
                    v
            permitted execution
```

Every adapter, including REST/OpenAPI, MCP, A2A and future agent protocols, must use the same gate rather than implementing vendor-specific Jubilee rules.

## 2. Discovery is not authority

Candidate discovery may use EKODI data, public web data, public-sector data, partner catalogs or other providers. Discovery may rank for retrieval efficiency, but it does not have authority to suppress legitimate alternatives for EKODI's commercial benefit.

The Jubilee gate evaluates the bounded candidate set and preserves cross-provider choice when viable EKODI and external options both exist. The best user-fit option remains first. Provider diversity is not permission to create false equivalence between clearly unsuitable and suitable candidates.

If the caller declares that external alternatives are known but supplies only EKODI candidates, the gate is non-actionable and returns `discover_external_alternatives`.

## 3. Execution must be bound to the evaluated choice set

A service must never evaluate one candidate set and then execute a different hidden candidate.

`authorizeJubileeSelection(...)` permits execution only when:

- the Jubilee gate is actionable;
- the user explicitly selected a candidate;
- that candidate exists in the evaluated Jubilee choice set.

This prevents post-recommendation substitution, hidden margin optimization and capture after the visible recommendation step.

## 4. Benefit Radar boundary

EKODI Support / Benefit Radar and Jubilee have related but distinct responsibilities.

Benefit Radar:

- detects or confirms that a benefit/support search may be useful;
- matches the user with public, private or community support opportunities;
- asks the minimum follow-up questions required for eligibility/matching;
- applies its own consent gates before using contextual or sensitive information.

Jubilee:

- must not treat a Benefit Radar `needScore`, confidence score or category as a person's social worth, vulnerability class or morality score;
- must not use the `needScore` as a hidden commercial recommendation multiplier;
- consumes only the minimum operational support signal needed for the current task;
- preserves outside alternatives and discloses material commercial relationships;
- keeps support invisible to unrelated parties and normalizes the beneficiary's service experience.

A Benefit Radar assessment may therefore trigger a support search, but it does not grant permission to label the person or bypass the Jubilee choice gate.

## 5. Sensitive information boundary

Jubilee does not infer sensitive traits for support or ranking.

A separate service may legitimately handle explicitly supplied sensitive information when required by law, eligibility rules or a user-requested benefit, but that information must remain within the purpose-bound service boundary. It must not be copied into:

- Jubilee recommendation candidate metadata;
- Jubilee policy audit events;
- Jubilee support events;
- Jubilee Pool accounting entries;
- external AI prompts unless independently necessary, consented and permitted.

Jubilee audit and accounting persist effects and policy evidence, not the person's sensitive reason for needing help.

## 6. Operational persistence boundary

`jubilee-operational-store.js` converts runtime/gate output into a privacy-minimized event contract before persistence.

It intentionally drops unknown fields and does not accept raw actor identifiers as `actor_ref_hash`. A stored actor reference must already be a 64-character SHA-256-style digest produced by the authorized integration layer.

The persistence adapter remains replaceable:

```text
Jubilee runtime / gate
        |
        v
operational store contract
        |
   +----+---------+-----------+
   |              |           |
Supabase       Postgres     future store
```

The initial Supabase schema is deny-direct to browser roles and stores no direct beneficiary identity or raw need signal.

## 7. Jubilee Pool boundary

Jubilee Pool entries are accounting events, not beneficiary profiles.

Beneficiary-facing entries use an opaque `support_ref`. The ledger records amount, purpose, policy version and lifecycle event. It must not record why the person is poor, disabled, marginalized or otherwise eligible.

Where identity is required to actually deliver a benefit, the authorized fulfillment service resolves `support_ref` separately under least privilege.

## 8. AI ecosystem neutrality

External AI integration must remain protocol and vendor neutral.

EKODI may expose its resources through multiple standards, but no AI provider receives a privileged policy bypass. A ChatGPT app, Gemini integration, Claude/MCP client, independent agent or future protocol must receive the same Jubilee constraints.

EKODI should publish useful, truthful and machine-readable information, while leaving the external AI free to compare EKODI with other sources. EKODI's goal is to be a trustworthy relationship resource, not the final answer authority for the wider AI ecosystem.

## 9. Adoption rule

A service is Jubilee-ready only when all of the following are true:

1. candidate discovery can include legitimate external alternatives where applicable;
2. material commercial relationships are represented reliably;
3. the shared Jubilee policy gate is called before presentation/execution;
4. execution is bound to the user-selected candidate in the evaluated choice set;
5. support reasons are not leaked into the audit/accounting layer;
6. policy and support events use the privacy-minimized operational store contract;
7. externally visible AI adapters cannot bypass these controls;
8. failure to obtain enough alternatives or required review fails closed rather than silently preferring EKODI.
