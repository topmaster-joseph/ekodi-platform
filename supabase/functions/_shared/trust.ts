import { hasEkodiCapability } from "./ekodi-capability.js";

export type TrustMode = "shadow" | "enforce";
export type ProjectionProfile =
  | "user-self"
  | "workspace-member"
  | "safe-admin"
  | "experience"
  | "external-AI"
  | "agent-task";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SecurityContextInput = {
  subjectId: string;
  workspaceId?: string | null;
  roles?: string[];
  authorityCapabilities?: string[];
  deniedCapabilities?: string[];
  elevated?: boolean;
  service: string;
  resource: string;
  action: string;
  purpose?: string | null;
  risk?: RiskLevel;
  attributes?: Record<string, unknown>;
};

export type SecurityContext = {
  subjectId: string;
  workspaceId: string | null;
  roles: string[];
  authorityCapabilities: string[];
  deniedCapabilities: string[];
  elevated: boolean;
  service: string;
  resource: string;
  action: string;
  purpose: string | null;
  risk: RiskLevel;
  attributes: Record<string, unknown>;
};

export type PolicyRule = {
  id: string;
  priority?: number;
  services?: string[];
  resources?: string[];
  actions?: string[];
  rolesAny?: string[];
  purposes?: string[];
  maxRisk?: RiskLevel;
  requiredCapabilities?: string[];
  requireElevation?: boolean;
  allow: boolean;
  capabilities?: string[];
  projectionProfile?: ProjectionProfile;
};

export type PolicyCoverage = {
  services?: string[];
  resources?: string[];
  actions?: string[];
  rolesAny?: string[];
  purposes?: string[];
  maxRisk?: RiskLevel;
};

export type TrustPolicyVersion = {
  policy_version: string;
  capability_schema_version: string;
  projection_version: string;
  status?: string;
  created_at?: string;
  config?: {
    rules?: PolicyRule[];
    coverage?: PolicyCoverage[];
    generic_evaluator_compatible?: boolean;
    authoritative_source?: string;
    cutover_allowed?: boolean;
    [key: string]: unknown;
  } | null;
};

export type TrustDecision = {
  allowed: boolean;
  ruleId: string;
  reasons: string[];
  capabilities: string[];
  projectionProfile: ProjectionProfile;
  policyVersion: string;
  capabilitySchemaVersion: string;
  projectionVersion: string;
};

export type ShadowComparison = {
  mode: TrustMode;
  effectiveAllowed: boolean;
  legacyAllowed: boolean;
  trustAllowed: boolean;
  parity: boolean;
  severity: "ok" | "review" | "critical";
  reason: string;
};

export const TRUST_VERSIONS = Object.freeze({
  policy: "trust_policy_v1",
  capabilitySchema: "capability_schema_v1",
  projection: "projection_v1",
});

const riskRank: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const clean = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);
const cleanCapabilities = (values: unknown[] = []) => [...new Set(values.map((value) => clean(value, 180).toLowerCase()).filter(Boolean))].sort();

export function canonicalCapability(namespace: string, resource: string, action: string) {
  const ns = clean(namespace, 80).toLowerCase();
  const target = clean(resource, 120).toLowerCase();
  const verb = clean(action, 80).toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(ns) || !/^[a-z0-9_.-]+$/.test(target) || !/^[a-z0-9_.-]+$/.test(verb)) {
    throw new Error("invalid_canonical_capability");
  }
  return `${ns}:${target}.${verb}`;
}

export function buildSecurityContext(input: SecurityContextInput): SecurityContext {
  const subjectId = clean(input.subjectId, 128);
  const service = clean(input.service, 80);
  const resource = clean(input.resource, 120);
  const action = clean(input.action, 80);
  if (!subjectId || !service || !resource || !action) {
    throw new Error("trust_context_required_fields_missing");
  }

  return {
    subjectId,
    workspaceId: input.workspaceId ? clean(input.workspaceId, 128) : null,
    roles: [...new Set((input.roles ?? []).map((role) => clean(role, 80)).filter(Boolean))].sort(),
    authorityCapabilities: cleanCapabilities(input.authorityCapabilities ?? []),
    deniedCapabilities: cleanCapabilities(input.deniedCapabilities ?? []),
    elevated: Boolean(input.elevated),
    service,
    resource,
    action,
    purpose: input.purpose ? clean(input.purpose, 120) : null,
    risk: input.risk ?? "low",
    attributes: safeAuditObject(input.attributes ?? {}),
  };
}

function tokenMatches(value: string, patterns?: string[]) {
  if (!patterns?.length) return true;
  return patterns.some((pattern) => pattern === "*" || pattern === value);
}

function conditionMatches(ctx: SecurityContext, condition: PolicyCoverage) {
  if (!tokenMatches(ctx.service, condition.services)) return false;
  if (!tokenMatches(ctx.resource, condition.resources)) return false;
  if (!tokenMatches(ctx.action, condition.actions)) return false;
  if (condition.rolesAny?.length && !condition.rolesAny.some((role) => ctx.roles.includes(role))) return false;
  if (condition.purposes?.length && (!ctx.purpose || !condition.purposes.includes(ctx.purpose))) return false;
  if (condition.maxRisk && riskRank[ctx.risk] > riskRank[condition.maxRisk]) return false;
  return true;
}

function ruleMatches(ctx: SecurityContext, rule: PolicyRule) {
  if (!conditionMatches(ctx, rule)) return false;
  if (rule.requiredCapabilities?.length && !rule.requiredCapabilities.every((capability) =>
    hasEkodiCapability(ctx.authorityCapabilities, capability, ctx.deniedCapabilities)
  )) return false;
  if (rule.requireElevation === true && !ctx.elevated) return false;
  return true;
}

export function policyCovers(ctx: SecurityContext, coverage: PolicyCoverage[] = []) {
  return coverage.length > 0 && coverage.some((condition) => conditionMatches(ctx, condition));
}

export function selectCoveredPolicy(
  ctx: SecurityContext,
  policies: TrustPolicyVersion[] = [],
  options: { genericEvaluatorOnly?: boolean } = {},
) {
  for (const policy of policies) {
    if (options.genericEvaluatorOnly && policy.config?.generic_evaluator_compatible === false) continue;
    const coverage = Array.isArray(policy.config?.coverage) ? policy.config.coverage : [];
    if (policyCovers(ctx, coverage)) return policy;
  }
  return null;
}

export function evaluatePolicy(ctx: SecurityContext, rules: PolicyRule[]): TrustDecision {
  const ordered = [...rules].sort((a, b) => {
    const priority = (b.priority ?? 0) - (a.priority ?? 0);
    if (priority !== 0) return priority;
    if (a.allow === b.allow) return 0;
    return a.allow ? 1 : -1;
  });
  const match = ordered.find((rule) => ruleMatches(ctx, rule));

  if (!match) {
    return {
      allowed: false,
      ruleId: "default-deny",
      reasons: ["No matching policy rule. Default deny applied."],
      capabilities: [],
      projectionProfile: "workspace-member",
      policyVersion: TRUST_VERSIONS.policy,
      capabilitySchemaVersion: TRUST_VERSIONS.capabilitySchema,
      projectionVersion: TRUST_VERSIONS.projection,
    };
  }

  return {
    allowed: match.allow,
    ruleId: match.id,
    reasons: [match.allow ? "Matched allow rule." : "Matched deny rule."],
    capabilities: match.allow ? [...new Set(match.capabilities ?? [])].sort() : [],
    projectionProfile: match.projectionProfile ?? "workspace-member",
    policyVersion: TRUST_VERSIONS.policy,
    capabilitySchemaVersion: TRUST_VERSIONS.capabilitySchema,
    projectionVersion: TRUST_VERSIONS.projection,
  };
}

/**
 * Transition adapter only. It deliberately mirrors the current authorization result
 * while Trust Layer is in shadow mode. It is not a permanent policy source.
 */
export function compatibilityDecision(
  legacyAllowed: boolean,
  options: {
    capabilities?: string[];
    projectionProfile?: ProjectionProfile;
    reason?: string;
  } = {},
): TrustDecision {
  return {
    allowed: legacyAllowed,
    ruleId: "legacy-compatibility-adapter",
    reasons: [options.reason ?? "Mirrored current EKODI authorization during Trust Layer transition."],
    capabilities: legacyAllowed ? [...new Set(options.capabilities ?? [])].sort() : [],
    projectionProfile: options.projectionProfile ?? "workspace-member",
    policyVersion: TRUST_VERSIONS.policy,
    capabilitySchemaVersion: TRUST_VERSIONS.capabilitySchema,
    projectionVersion: TRUST_VERSIONS.projection,
  };
}

/**
 * Shadow mode can never change the live result. Enforce mode also requires an explicit
 * cutover gate so importing this helper cannot accidentally promote Trust to authority.
 */
export function compareWithLegacy(
  legacyAllowed: boolean,
  decision: TrustDecision,
  mode: TrustMode = "shadow",
  gate: { cutoverAllowed: boolean } = { cutoverAllowed: false },
): ShadowComparison {
  if (mode === "enforce" && !gate.cutoverAllowed) {
    throw new Error("trust_cutover_not_allowed");
  }

  const parity = legacyAllowed === decision.allowed;
  let severity: ShadowComparison["severity"] = "ok";
  let reason = "Legacy and Trust decisions match.";

  if (!parity && !legacyAllowed && decision.allowed) {
    severity = "critical";
    reason = "Trust would widen access that legacy authorization denies.";
  } else if (!parity) {
    severity = "review";
    reason = "Trust would restrict access that legacy authorization allows.";
  }

  return {
    mode,
    effectiveAllowed: mode === "shadow" ? legacyAllowed : decision.allowed,
    legacyAllowed,
    trustAllowed: decision.allowed,
    parity,
    severity,
    reason,
  };
}

const restrictedKey = /(secret|password|passwd|token|api[_-]?key|private[_-]?key|credential|authorization|cookie|service[_-]?role|connection[_-]?string|internal[_-]?(url|endpoint|path)|repo(sitory)?|branch|topology)/i;

function mask(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return "";
  if (raw.length <= 4) return "****";
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

/** Always removes reusable secrets and infrastructure details before projection. */
export function secureProjection(
  value: unknown,
  options: {
    allowFields?: string[];
    redactFields?: string[];
    maskFields?: string[];
  } = {},
): unknown {
  const allow = options.allowFields ? new Set(options.allowFields) : null;
  const redact = new Set(options.redactFields ?? []);
  const masked = new Set(options.maskFields ?? []);

  const visit = (node: unknown, depth: number): unknown => {
    if (depth > 8) return "[depth-limited]";
    if (Array.isArray(node)) return node.slice(0, 500).map((item) => visit(item, depth + 1));
    if (!node || typeof node !== "object") return node;

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (restrictedKey.test(key)) continue;
      if (allow && depth === 0 && !allow.has(key)) continue;
      if (redact.has(key)) {
        output[key] = "[redacted]";
        continue;
      }
      if (masked.has(key)) {
        output[key] = mask(child);
        continue;
      }
      output[key] = visit(child, depth + 1);
    }
    return output;
  };

  return visit(value, 0);
}

/** Safe summary only. Never place request bodies, credentials, or raw tokens in audit rows. */
export function safeAuditObject(input: Record<string, unknown>) {
  return secureProjection(input) as Record<string, unknown>;
}

/**
 * Legacy capability derivation retained for compatibility-only Trust surfaces.
 * New migrations should emit canonical `namespace:resource.action` capabilities
 * explicitly through canonicalCapability() instead of extending this dotted grammar.
 */
export function capabilitySet(params: {
  roles: string[];
  service: string;
  resource: string;
  action: string;
  legacyAllowed: boolean;
}) {
  if (!params.legacyAllowed) return [];
  const base = `${clean(params.service, 80)}.${clean(params.resource, 120)}`;
  const action = clean(params.action, 80);
  if (!action) return [];
  const caps = new Set<string>([`${base}.${action}`]);
  if (params.roles.some((role) => ["owner", "tenant_admin", "platform_admin", "admin"].includes(role))) {
    caps.add(`${base}.manage`);
  }
  if (params.roles.includes("platform_admin")) caps.add(`${base}.diagnose_safe`);
  return [...caps].sort();
}
