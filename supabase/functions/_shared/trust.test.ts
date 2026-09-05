import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildSecurityContext,
  canonicalCapability,
  capabilitySet,
  compareWithLegacy,
  compatibilityDecision,
  evaluatePolicy,
  policyCovers,
  secureProjection,
  selectCoveredPolicy,
} from "./trust.ts";

Deno.test("security context normalizes duplicate roles", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    workspaceId: "workspace-1",
    roles: ["member", "member", "tenant_admin"],
    service: "trade",
    resource: "counterparty",
    action: "view",
  });
  assertEquals(context.roles, ["member", "tenant_admin"]);
});

Deno.test("canonical capability uses Admin OS namespace grammar", () => {
  assertEquals(canonicalCapability("workspace", "access", "review"), "workspace:access.review");
  assertEquals(canonicalCapability("admin", "accounts", "write"), "admin:accounts.write");
  assertThrows(
    () => canonicalCapability("workspace:*", "access", "review"),
    Error,
    "invalid_canonical_capability",
  );
});

Deno.test("candidate policy coverage must be explicit", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    workspaceId: "workspace-1",
    roles: ["tenant_admin"],
    service: "biz",
    resource: "access-request",
    action: "review",
    risk: "high",
  });
  assertEquals(policyCovers(context, []), false);
  assertEquals(policyCovers(context, [{ services: ["*"], resources: ["access-request"], actions: ["review"] }]), true);
  assertEquals(policyCovers(context, [{ services: ["*"], resources: ["access-request"], actions: ["pending.read"] }]), false);
});

Deno.test("coverage resolver keeps independent migration policies from shadowing each other", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    service: "biz",
    resource: "access-request",
    action: "review",
  });
  const selected = selectCoveredPolicy(context, [
    {
      policy_version: "trust_policy_v3",
      capability_schema_version: "capability_schema_v2",
      projection_version: "projection_v1",
      config: { coverage: [{ services: ["work"], resources: ["work-admin"], actions: ["job.moderate"] }] },
    },
    {
      policy_version: "trust_policy_v2",
      capability_schema_version: "capability_schema_v2",
      projection_version: "projection_v1",
      config: { coverage: [{ services: ["*"], resources: ["access-request"], actions: ["review"] }] },
    },
  ]);
  assertEquals(selected?.policy_version, "trust_policy_v2");
});

Deno.test("generic resolver skips endpoint-specific policies", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    service: "work",
    resource: "work-admin",
    action: "job.moderate",
  });
  const selected = selectCoveredPolicy(context, [{
    policy_version: "trust_policy_v3",
    capability_schema_version: "capability_schema_v2",
    projection_version: "projection_v1",
    config: {
      generic_evaluator_compatible: false,
      coverage: [{ services: ["work"], resources: ["work-admin"], actions: ["job.moderate"] }],
    },
  }], { genericEvaluatorOnly: true });
  assertEquals(selected, null);
});

Deno.test("policy capability condition uses Admin OS wildcard grammar and explicit deny", () => {
  const allowedContext = buildSecurityContext({
    subjectId: "admin-1",
    roles: ["super_admin"],
    authorityCapabilities: ["service:*"],
    service: "work",
    resource: "work-admin",
    action: "job.moderate",
  });
  const rule = {
    id: "work-admin-operate",
    services: ["work"],
    resources: ["work-admin"],
    actions: ["job.moderate"],
    requiredCapabilities: ["service:operate"],
    allow: true,
    capabilities: ["service:operate"],
  };
  assertEquals(evaluatePolicy(allowedContext, [rule]).allowed, true);

  const deniedContext = buildSecurityContext({
    subjectId: "admin-1",
    roles: ["super_admin"],
    authorityCapabilities: ["service:*"],
    deniedCapabilities: ["service:operate"],
    service: "work",
    resource: "work-admin",
    action: "job.moderate",
  });
  assertEquals(evaluatePolicy(deniedContext, [rule]).allowed, false);
});

Deno.test("access reviewer candidate policy allows tenant admin with canonical capability", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    workspaceId: "workspace-1",
    roles: ["tenant_admin"],
    service: "biz",
    resource: "access-request",
    action: "review",
    risk: "high",
  });
  const decision = evaluatePolicy(context, [{
    id: "access-request-review-reviewer",
    priority: 100,
    services: ["*"],
    resources: ["access-request"],
    actions: ["review"],
    rolesAny: ["tenant_admin", "platform_admin"],
    allow: true,
    capabilities: ["workspace:access.review"],
    projectionProfile: "safe-admin",
  }]);
  assertEquals(decision.allowed, true);
  assertEquals(decision.capabilities, ["workspace:access.review"]);
  assertEquals(decision.projectionProfile, "safe-admin");
});

Deno.test("access reviewer candidate policy default-denies ordinary member", () => {
  const context = buildSecurityContext({
    subjectId: "user-2",
    workspaceId: "workspace-1",
    roles: ["member"],
    service: "biz",
    resource: "access-request",
    action: "review",
    risk: "high",
  });
  const decision = evaluatePolicy(context, [{
    id: "access-request-review-reviewer",
    priority: 100,
    services: ["*"],
    resources: ["access-request"],
    actions: ["review"],
    rolesAny: ["tenant_admin", "platform_admin"],
    allow: true,
    capabilities: ["workspace:access.review"],
  }]);
  assertEquals(decision.allowed, false);
  assertEquals(decision.ruleId, "default-deny");
});

Deno.test("policy is default deny when no rule matches", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    roles: ["member"],
    service: "trade",
    resource: "counterparty",
    action: "export",
  });
  const decision = evaluatePolicy(context, []);
  assertEquals(decision.allowed, false);
  assertEquals(decision.ruleId, "default-deny");
});

Deno.test("deny wins over allow at equal priority", () => {
  const context = buildSecurityContext({
    subjectId: "user-1",
    roles: ["member"],
    service: "trade",
    resource: "counterparty",
    action: "view",
  });
  const decision = evaluatePolicy(context, [
    { id: "allow-member", priority: 10, rolesAny: ["member"], allow: true },
    { id: "deny-member", priority: 10, rolesAny: ["member"], allow: false },
  ]);
  assertEquals(decision.allowed, false);
  assertEquals(decision.ruleId, "deny-member");
});

Deno.test("shadow mode can never change the live legacy result", () => {
  const trust = compatibilityDecision(false);
  trust.allowed = true;
  const comparison = compareWithLegacy(false, trust, "shadow");
  assertEquals(comparison.effectiveAllowed, false);
  assertEquals(comparison.severity, "critical");
  assertEquals(comparison.parity, false);
});

Deno.test("enforce mode is impossible without explicit cutover gate", () => {
  const trust = compatibilityDecision(true);
  assertThrows(
    () => compareWithLegacy(true, trust, "enforce"),
    Error,
    "trust_cutover_not_allowed",
  );
});

Deno.test("compatibility adapter preserves current authorization", () => {
  const trust = compatibilityDecision(true, { capabilities: ["trade.counterparty.view"] });
  const comparison = compareWithLegacy(true, trust, "shadow");
  assertEquals(comparison.effectiveAllowed, true);
  assertEquals(comparison.trustAllowed, true);
  assertEquals(comparison.parity, true);
});

Deno.test("view permission does not imply export capability", () => {
  const view = capabilitySet({
    roles: ["member"],
    service: "trade",
    resource: "counterparty",
    action: "view",
    legacyAllowed: true,
  });
  assert(view.includes("trade.counterparty.view"));
  assertEquals(view.includes("trade.counterparty.export"), false);
});

Deno.test("secure projection removes reusable secrets and internal topology recursively", () => {
  const projected = secureProjection({
    id: "safe-id",
    email: "member@example.com",
    api_key: "must-never-leak",
    nested: {
      access_token: "token",
      private_key: "key",
      internal_endpoint: "https://private.internal",
      display_name: "Safe Name",
    },
  }) as Record<string, any>;

  assertEquals(projected.id, "safe-id");
  assertEquals(projected.api_key, undefined);
  assertEquals(projected.nested.access_token, undefined);
  assertEquals(projected.nested.private_key, undefined);
  assertEquals(projected.nested.internal_endpoint, undefined);
  assertEquals(projected.nested.display_name, "Safe Name");
});

Deno.test("projection can independently mask and redact fields", () => {
  const projected = secureProjection(
    { phone: "01012345678", note: "private", name: "Member" },
    { maskFields: ["phone"], redactFields: ["note"] },
  ) as Record<string, unknown>;

  assert(String(projected.phone).includes("***"));
  assertEquals(projected.note, "[redacted]");
  assertEquals(projected.name, "Member");
});
