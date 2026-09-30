# EKODIAN Identity Profile Registry v1

EKODIAN Identity Profile Registry is the identity layer between the shared Character DNA and a human-inspired or user-personalized visual profile.

## Hierarchy

`EKODI Constitution -> Character Constitution -> Character Registry -> Identity Profile Registry -> Role/State/Service Context -> UI`

## Stable rules

- The default profile is `canonical`.
- Founder, pastor and personal profiles are opt-in. They are never inferred from a Google login, email address or display name.
- Human-inspired profiles do not create, grant or expand authority. Authorization remains `Person + Workspace + Role + Capability`.
- Raw biometric templates and face embeddings are forbidden in the runtime registry. The runtime stores only an approved visual asset reference.
- Human-inspired visual assets require subject authorization.
- Payment, personal-data, security and high-risk decision flows use the canonical character or no character.
- A missing or unapproved portrait asset falls back to the canonical EKODIAN face without breaking the UI.

## Profile IDs

- `canonical`: shared EKODIAN.
- `founder`: representative Founder/Guide profile.
- `founder-pastor`: pastoral representative profile for Church contexts.
- `personal`: authenticated user-personalized template.

## Portrait asset contract

A portrait is accepted only when it is an HTTPS reference on `ekodi.kr` or an `*.ekodi.kr` host. Base64/data URLs are rejected. The portrait is rendered inside the canonical EKODIAN face silhouette, preserving the shared body proportions, palette, role/state behavior and critical-workflow restraint.

The Founder/Pastor portrait URL is intentionally empty until an approved reference asset is published. Adding the approved asset later does not require changing the operating model.
