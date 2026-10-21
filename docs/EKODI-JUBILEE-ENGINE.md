# EKODI Jubilee Engine

Status: foundation proposal and executable policy/runtime/data-layer implementation
Policy version: `1.0.0`

## 1. Purpose

The EKODI Jubilee Engine turns 희년정신 into an operational platform policy rather than a branding statement.

The engine exists to keep EKODI internally strong while keeping the outside boundary open: users retain meaningful choice, external alternatives are not suppressed, commercial interests are disclosed, and people facing access barriers can receive practical support without being publicly labeled or stigmatized.

The Jubilee Engine is a shared policy layer. It is not a separate customer-facing product and should not require a separate public domain.

## 2. Core invariant

```text
Strong inside
  quality + reliability + speed + independence + sustainable revenue
                              |
                              v
                     Jubilee policy gate
                              |
                              v
Open outside
  choice + alternatives + disclosure + fair access + reciprocity
```

The engine must never become a central moral authority or a single opaque score. It returns bounded policy decisions, reasons, alternatives, support actions, disclosures and an audit trace. The user remains the chooser between legitimate alternatives, while platform governance retains authority over system policy, safety and operation.

## 3. Runtime placement

```text
Service / AI / Search / Commerce / Community request
                     |
                     v
             Candidate discovery
                     |
                     v
             Jubilee Engine
        +------------+-------------+
        |            |             |
        v            v             v
   hard rules   choice set    support actions
        |            |             |
        +------------+-------------+
                     |
                     v
        explanation + disclosures
                     |
                     v
               user choice
                     |
                     v
         execution / connection
                     |
                     v
       audit + Jubilee Pool event
```

The runtime is implemented in `jubilee-runtime.js`. The machine-readable policy contract is `config/jubilee-policy.json`.

## 4. Hard rules

The first implementation enforces these non-negotiable boundaries:

1. A materially better external option must not be hidden merely because EKODI benefits from an internal option.
2. A commercial relationship must be disclosed before the candidate can be presented as eligible.
3. Sponsorship must not secretly alter recommendation ranking.
4. User support or ranking must not depend on inferred sensitive traits.
5. Support must not require a public `vulnerable` badge or similar social-status label.
6. Users must not be punished for choosing an external provider or leaving an EKODI service.
7. Cross-tenant private profiling is prohibited.
8. User fit takes priority over platform margin inside the recommendation boundary.
9. When viable EKODI and external candidates both exist, the choice set preserves at least one meaningful candidate from each source within the bounded result set.

## 5. Non-stigmatizing support

Do not store a generalized identity such as `vulnerable_person=true`.

Use the minimum practical need signal, only when it is user-provided, consented, or program-eligibility verified.

Allowed first-version signals:

- `affordability_constraint`
- `access_barrier`
- `language_support_required`
- `mobility_access_required`
- `digital_access_constraint`
- `time_access_constraint`

Examples of discreet responses:

- fee waiver review
- Jubilee credit
- lower-cost alternatives
- assisted channel
- language support
- accessible or remote option
- low-friction access
- asynchronous or flexible service

The support reason is shared only with components that need it to execute the benefit.

Operational persistence deliberately stores the resulting support action, policy version and opaque support reference, not the person's vulnerability category or raw need signal.

## 6. Recommendation model

The engine deliberately does not calculate one Jubilee or morality score.

Candidates may carry separate operational dimensions:

- `userFit`
- `affordability`
- `accessibility`
- `serviceQuality`
- `continuity`
- `communityBenefit`
- `providerIndependence`

Hard rules are applied first. Eligible candidates are then ordered primarily by task-specific `userFit`, with service quality used only as a deterministic tie-breaker. Multiple viable options are preserved near the top when possible.

The best-fit candidate remains first. If a five-result choice set would otherwise contain only one provider class while a viable candidate exists from the other class, the engine preserves the strongest cross-provider alternative without using platform margin as a ranking signal.

Commercial margin is not a ranking dimension.

## 7. Jubilee Pool

The Jubilee Pool is a funding mechanism, not a public label for beneficiaries.

Potential funding sources:

- platform allocation
- voluntary contribution
- partner co-funding

Permitted purposes:

- access support
- fee relief
- community reinvestment
- connection support

Every allocation must be auditable, while the normal user interface should avoid unnecessary disclosure of why a person received a benefit.

The initial operational ledger is defined by `supabase/migrations/20260904023000_jubilee_operational_ledger.sql` and contains three deny-direct internal resources:

- `jubilee_policy_events`: privacy-minimized policy decision evidence
- `jubilee_support_events`: support action execution evidence using opaque `support_ref`
- `jubilee_pool_entries`: append-oriented Pool accounting events without beneficiary identity

`jubilee_pool_balance_v1` exposes only an aggregate internal balance by currency. Browser roles receive no direct table or view privileges.

The ledger intentionally has no `user_id`, `person_id`, `beneficiary_id`, vulnerability-label, sensitive-trait or need-signal column. Identity resolution, when legitimately required to deliver a benefit, belongs in a separately authorized execution context and must not be copied into the Jubilee audit/ledger layer.

## 8. API contract target

The recommended shared endpoint is eventually exposed through the existing EKODI shared API rather than a new public subdomain:

`POST /api/jubilee/v1/evaluate`

Illustrative request:

```json
{
  "workspace_id": "ws_123",
  "context": {
    "needSignals": [
      { "type": "affordability_constraint", "source": "user_provided" }
    ]
  },
  "market": {
    "externalAlternativesKnown": true
  },
  "candidates": [
    {
      "id": "candidate-a",
      "source": "ekodi",
      "userFit": 0.82,
      "serviceQuality": 0.9,
      "commercialRelationship": true,
      "commercialDisclosure": "EKODI receives a referral benefit."
    },
    {
      "id": "candidate-b",
      "source": "external",
      "userFit": 0.91,
      "serviceQuality": 0.85
    }
  ]
}
```

Illustrative response:

```json
{
  "status": "ready",
  "policyVersion": "1.0.0",
  "choiceSet": [],
  "supportActions": ["consider_jubilee_credit"],
  "disclosures": [],
  "externalAlternativeLookupRequired": false,
  "humanReviewRequired": false,
  "audit": {
    "policyVersion": "1.0.0",
    "rulesTriggered": [],
    "warnings": []
  }
}
```

The public or partner-facing API must use capability-scoped authorization and should never expose internal support reasons, cross-tenant profiles, platform secrets or private workspace data.

The API handler already emits privacy-minimized audit metadata through its injected `audit` adapter. A production integration should persist only that minimized envelope into `jubilee_policy_events`, never the submitted `context.needSignals` or request body.

## 9. Integration order

1. Recommendation and discovery flows
2. EKODI Mall product recommendation
3. People / provider / service connection
4. Pricing, credits and fee relief
5. AI gateway and external agent interfaces
6. Community reinvestment and Jubilee Pool accounting
7. Admin observability and policy audit

Each adopter should call the same shared runtime rather than reimplementing Jubilee logic locally.

For external AI interoperability, Jubilee is a policy gate rather than an AI-vendor-specific integration. REST/OpenAPI, MCP, A2A or future adapters may all call the same runtime and must receive the same non-capture, disclosure and privacy rules.

## 10. Observability

Recommended metrics are multi-dimensional and must not be collapsed into a vanity score:

- external alternative preservation rate
- provider-choice diversity preservation rate
- commercial disclosure compliance
- user-choice diversity
- user-fit delta before and after policy gate
- support action delivery rate
- access completion improvement
- community reinvestment rate
- lock-in / capture incidents
- policy exceptions and human-gate frequency

Do not publish beneficiary-level support analytics.

## 11. Governance

Every decision includes `policyVersion` and an audit trace.

Changes that materially reduce user choice, weaken disclosure, expand sensitive profiling, or reduce support protections require a human governance gate. Policy thresholds can remain internal, but the public principles should remain explainable.

This foundation intentionally does not modify `CONSTITUTION.md`. Constitutional adoption should follow the repository's protected governance process. The runtime, data model and integrations can be reviewed and tested independently before constitutional promotion.

## 12. Definition of done for production adoption

The Jubilee Engine is not production-complete until:

- all tests pass in CI;
- recommendation paths call the shared runtime;
- commercial relationship metadata is reliable;
- external candidates can actually enter the candidate pool;
- need signals are consented, minimally handled and not persisted into the operational ledger;
- Jubilee Pool actions have an auditable accounting path;
- service-role persistence writes privacy-minimized policy/support events;
- admin observability exists without exposing beneficiary identities unnecessarily;
- staging verifies that choosing an external provider causes no penalty or hidden downgrade;
- production promotion passes the platform's existing guarded release process.
