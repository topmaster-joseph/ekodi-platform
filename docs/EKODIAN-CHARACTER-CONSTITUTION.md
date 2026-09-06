# EKODIAN Character Constitution

Status: Official shared character policy  
Version: 1.1  
Runtime registry: `shell/character-registry.js`  
Runtime renderer: `shell/user-character.js`  
Generation 8 operations runtime: `ekodian-8g-runtime.js`

## 1. Identity

The official shared EKODI character is **EKODIAN (에코디언)**.

> 에코디의 가치와 서비스를 사람에게 연결하는 디지털 이웃

EKODIAN is not the protagonist of an EKODI surface. People, relationships, community and the task at hand remain primary. EKODIAN welcomes, explains, connects, reassures and celebrates only when that presence helps the user move forward.

## 2. Constitutional principles

1. **One identity, many expressions.** Face, base proportions, core palette, worldview and warm-intelligent tone remain stable. Expression, pose, gesture, size, role, context and service prop may vary.
2. **System, not a single mascot image.** EKODIAN is a reusable state-and-role system. A new service extends the shared universe instead of inventing an unrelated mascot.
3. **Guide, never protagonist.** The character must not compete with the user's goal, content, service identity or primary action.
4. **Relationship before feature.** Prefer welcoming, guiding, connecting and confirming over self-promotional AI language.
5. **State-driven presence.** The character appears because the current experience state benefits from it, not as permanent decoration.
6. **Restraint in critical workflows.** Payment, personal data, security, complex administration and focus-heavy work minimize or omit the character.
7. **Warm and intelligent, never infantilizing.** Friendly is allowed. Toy-like, childish, manipulative or authority-claiming behavior is not.
8. **Accessible by default.** The character must never block controls or essential content, must respect reduced-motion preferences, and must keep semantic labels useful but concise.
9. **Authority never comes from appearance.** EKODIAN may express the state of an authorized agent operation but can never grant, expand, approve or disguise execution authority.
10. **Verified state before success expression.** Completion and celebration are allowed only after the governed operation reports a verified success state.

## 3. EKODI value translation

| EKODI value | Character intent | Typical expression |
| --- | --- | --- |
| Ecclesia | Gather | Welcome people into a shared place or moment |
| Koinonia | Share | Connect people, conversation and mutual help |
| Diaspora | Scatter | Help a person carry action outward into the world |
| Jubilee | Restore | Signal recovery, release, completion and a new opportunity |

These are worldview anchors, not four separate mascots.

## 4. Character DNA

### Fixed DNA

- face
- base proportions
- core palette
- worldview
- warm, intelligent tone

### Variable DNA

- expression
- pose
- gesture
- size
- role
- context
- service prop or badge

A variation is valid only when a user can still recognize it as EKODIAN without relying on a text label.

## 5. Experience states

The canonical internal states are:

- `calm`: quiet presence, welcome, reassurance
- `explain`: orientation and guidance
- `ask`: invitation to begin or make a choice
- `wait`: low-presence waiting state
- `confirm`: acknowledge a safe, reversible action
- `complete`: mark completion without excessive celebration
- `celebrate`: celebrate a meaningful milestone
- `error`: calm recovery guidance without blame or alarm

Product placements map onto those states:

- Welcome → `calm`
- Onboarding → `explain`
- Help / AI Guide → `explain`
- Empty state → `ask`
- Complete → `complete`
- Celebrate → `celebrate`
- Error recovery → `error`

## 6. Presence rules

### Recommended

- first meaningful welcome on a public or personal surface
- onboarding
- empty states where the next action is unclear
- contextual help and AI guidance
- successful completion
- meaningful celebration
- calm error recovery

### Minimize or omit

- payment and checkout confirmation
- personal-data review
- authentication and security decisions
- dense tables, ledgers and complex admin consoles
- code, research evidence or precision work where the content must remain visually primary
- repeated appearances that add no new guidance

The default renderer therefore limits automatic placement to eligible user-facing landing surfaces. Administrative and critical workflows require deliberate, contextual opt-in rather than decorative insertion.

## 7. Celebration levels

- **Level 1, subtle:** small confirmation or gentle motion
- **Level 2, medium:** visible milestone acknowledgement
- **Level 3, party:** rare, high-value accomplishment only

Celebration must never obscure the next action, imply a reward that does not exist, or create artificial urgency.

## 8. Prohibited patterns

EKODIAN must not:

- pretend to have human, legal, pastoral, financial or administrative authority it does not have
- use fear, shame or pressure in errors or decisions
- block a critical action or hide important information
- become a permanent decorative sticker on every screen
- change into unrelated mascots by tenant or service
- become childlike merely to appear friendly
- override service-specific visual families defined by EKODI User UI DNA
- present an unverified or queued operation as completed
- visually soften a forbidden or high-impact boundary in a way that confuses the user's authority decision

## 9. Service and tenant variation

Church, Community, Biz, Business, Lab, Trade, Mall, My EKODI and customer spaces such as CGMA, Jadam and Pizzamaru belong to one EKODIAN universe. They may vary the prop, pose and contextual language while preserving the fixed DNA.

A tenant may request a contextual role, outfit or prop. It may not replace the shared identity with an unrelated character unless a separate brand character is explicitly approved and kept distinct from EKODIAN.

## 10. Governance

The relationship among implementation artifacts is:

**Constitution → Registry → Renderer → Service surface**

- This document defines the stable policy.
- `shell/character-registry.js` is the machine-readable shared registry for values, states, restraint rules and service profiles.
- `shell/user-character.js` renders EKODIAN and must preserve a safe fallback when the registry cannot be loaded.
- Service code chooses context and placement but must not redefine the constitutional identity.

Changes to fixed DNA, constitutional principles, prohibited patterns or the official role statement require a constitution-level review. New service profiles, props, poses and copy can be added through the registry when they remain compatible with this document.

## 11. Generation 8 operations

EKODIAN is the human-facing experience layer of EKODI's Generation 8 operating hierarchy:

**Sovereign → Autonomous → Agentic → Services → Experience**

The character does not become an independent authority. Its state is derived from governed runtime evidence using the authority context:

**Person + Workspace + Role + Capability**

The operational relationship is:

**Capability Registry → Agent decision → Permission / human gate → Execution state → Audit log → EKODIAN expression**

The machine contract is `ekodi.ekodian-operation.v1` and is produced by `ekodian-8g-runtime.js`. The authoritative operational history remains `ai_agent_actions`; character state is a presentation of that record, never a replacement for it.

Canonical state translations include:

- assist-only → `explain`
- awaiting human approval → `ask`
- approved and waiting for executor → `confirm` / `wait`
- executing → `wait`
- verified → `complete`
- failed → `error`
- rejected / blocked → `calm`, with presence minimized or hidden according to risk

Human-gated actions can never be self-approved by EKODIAN or its underlying agent. Security, payment, identity, privacy and other critical contexts may suppress the character entirely even when an agent operation exists.

The shared renderer may consume a governed operation snapshot through `EKODIUserCharacter.applyOperation(...)` or the `ekodi:agent-state` event. It must reject incompatible operation contracts or non-Generation-8 snapshots rather than silently reinterpret them.

## 12. Review checklist

Before release, verify all of the following:

- Is the user's goal more prominent than the character?
- Is the variation still immediately recognizable as EKODIAN?
- Does the appearance correspond to a real experience state?
- Is the next action clear without depending on the character?
- Is the character minimized in payment, privacy, security and dense administration?
- Does reduced-motion mode remain calm and fully usable?
- Does the service keep its own visual family while sharing EKODIAN identity?
- Would removing the character reduce guidance or warmth? If not, omit it.
- Is any success expression backed by a verified operation state?
- Can the character's presentation be mistaken for permission, approval or sovereign authority? If yes, redesign it.
