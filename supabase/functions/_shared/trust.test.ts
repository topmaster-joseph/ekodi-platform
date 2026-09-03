import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildSecurityContext,
  compareWithLegacy,
  compatibilityDecision,
  evaluatePolicy,
  secureProjection,
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

Deno.test("shadow mode can never change the live legacy result", () => {
  const trust = compatibilityDecision(false);
  trust.allowed = true;
  const comparison = compareWithLegacy(false, trust, "shadow");
  assertEquals(comparison.effectiveAllowed, false);
  assertEquals(comparison.severity, "critical");
  assertEquals(comparison.parity, false);
});

Deno.test("compatibility adapter preserves current authorization", () => {
  const trust = compatibilityDecision(true, { capabilities: ["trade.counterparty.view"] });
  const comparison = compareWithLegacy(true, trust, "shadow");
  assertEquals(comparison.effectiveAllowed, true);
  assertEquals(comparison.trustAllowed, true);
  assertEquals(comparison.parity, true);
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
