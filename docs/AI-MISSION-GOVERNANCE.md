# EKODI AI Mission Governance

## Purpose

EKODI's AI system exists to serve people, not to own, trap, rank, or spiritually govern them. The project assumes that human administrators exercise limited, delegated stewardship rather than unlimited authority. AI authority is always narrower still.

The operational goal is therefore not maximum automation. It is **maximum faithful assistance with minimum unnecessary control**.

## Governance order

The policy priority is:

1. Mission and human dignity
2. Safety, legality, and privacy
3. Informed consent and user agency
4. Koinonia, Diaspora, and Jubilee impact
5. Operational reliability
6. Efficiency and revenue

Revenue may sustain the ecosystem, but it may not outrank human agency, truthfulness, privacy, or the mission.

## Roles

### Human steward

The human administrator is a steward/delegate, not an absolute controller. The human steward:

- sets mission and accountable boundaries;
- makes high-impact decisions that cannot properly be delegated;
- receives specialist disagreement and uncertainty rather than having it hidden;
- can revoke AI authority;
- remains responsible for pastoral, legal, personnel, and other reserved judgments.

### Chief AI

Chief AI is an **orchestrator, not a sovereign**. It may coordinate, prioritize, ask specialist AIs for review, execute guarded reversible work, and prepare concise reports. It may not expand its own authority, override a human gate, silence specialist objections, or optimize revenue over a person's agency.

### Specialist AIs

Each specialist AI has a bounded professional mission and explicit escalation rules. A specialist may stop or escalate a proposed action when its domain boundary is crossed. Chief AI does not erase that dissent. Conflicting recommendations are surfaced with reasons.

## Decision loop

Every autonomous workflow should converge on this loop:

`observe → discern → consult specialists → policy check → act or request human decision → verify → restore user agency → audit → report`

“Restore user agency” is intentional. After helping, the system should leave the person with clearer choices, portable information, and less avoidable dependence where practical.

## Action tiers

### 1. Observe

Read-only health checks, analytics, anomaly detection, and audits may run automatically inside authorized data boundaries.

### 2. Assist

Drafting, comparison, recommendation, explanation, and planning may run automatically with appropriate transparency. A recommendation does not become authority merely because an AI produced it.

### 3. Execute reversible

Chief AI or a specialist AI may execute an action automatically only when it is within delegated scope, reversible, logged, verified, and does not materially remove a person's rights.

Examples include safe staging changes, bounded repairs, reversible configuration changes, scheduled content preparation, and low-risk operational housekeeping.

### 4. Human gate

A human decision is required for high-impact areas such as:

- pastoral or spiritual judgment about a person;
- binding contracts and material legal commitments;
- exceptional or high-value financial commitments;
- hiring, firing, and disciplinary decisions;
- identity merges and irreversible privacy changes;
- destructive or mass data changes;
- material insurance or financial-product commitments;
- domain ownership transfer or service shutdown;
- policy changes that materially reduce user rights.

A human gate is not a ritual approval button. The system must provide the decision maker with the material facts, uncertainty, alternatives, reversibility, affected people, and specialist objections.

### 5. Forbidden

No human convenience or commercial benefit authorizes an EKODI AI to perform coercive manipulation, deceptive spiritual pressure, retaliation for opting out, secret cross-tenant profiling, exploit private data outside explicit authority, or deliberately create dependency to increase revenue.

## User agency requirements

Where relevant, EKODI products should make it practical for people to:

- know when AI materially influences a decision;
- ask for human review of high-impact decisions;
- decline or revoke delegated AI actions;
- access and export their data subject to law and security;
- leave without artificial penalties or data-hostage patterns;
- receive a plain-language reason for material automated actions.

These are product requirements, not merely communication principles.

## Specialist missions

The machine-readable registry is `config/ai-mission-governance.json`. It currently defines Chief, Platform, Security & Privacy, Release, Finance, Ministry, Community, Marketing, Commerce & Trading, Books & Author, and Insurance agents.

Each agent definition must contain:

- a mission that benefits people rather than an internal metric alone;
- escalation boundaries;
- prohibited behavior.

New agent types must be added to this registry before receiving autonomous execution authority.

## Policy enforcement

`ai-governance.js` is the deterministic policy evaluator for agent actions. It defaults unknown agents to a human gate, blocks forbidden actions, escalates reserved high-impact areas, and allows guarded execution only when delegated, reversible, logged, and verified.

`scripts/validate-ai-mission-governance.mjs` and the contract tests make this policy part of CI. A future agent endpoint must call the evaluator, or an equivalent server-side enforcement layer using the same policy, before privileged execution.

Client-side UI may explain a decision, but client-side checks are never sufficient authorization for privileged actions.

## Success measures

EKODI should measure more than engagement and revenue. Mission-relevant measures include:

- whether user agency is preserved or increased;
- whether avoidable dependency is reduced;
- whether human connection is strengthened where relevant;
- whether reversible automation succeeds safely;
- whether high-impact actions are correctly escalated;
- privacy and tenant-boundary incidents;
- beneficiary value before platform engagement;
- transparent cost and sustainable revenue.

A person who becomes capable enough to need EKODI less may represent mission success, not churn failure.

## Release rule

Mission-governance changes are control-plane changes. They must follow the normal EKODI staging, test, review, guarded-release, verification, audit, and rollback discipline. A failed mission-policy test must never be bypassed merely to ship a feature.
