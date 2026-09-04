import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildSecurityContext,
  capabilitySet,
  compareWithLegacy,
  compatibilityDecision,
  evaluatePolicy,
  safeAuditObject,
  secureProjection,
  TRUST_VERSIONS,
  type PolicyRule,
  type ProjectionProfile,
  type RiskLevel,
} from "../_shared/trust.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, service, { auth: { persistSession: false } });

const allowedOrigin = (origin: string | null) => {
  if (!origin) return "https://auth.ekodi.kr";
  try {
    const parsed = new URL(origin);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "ekodi.kr" ||
        parsed.hostname.endsWith(".ekodi.kr") ||
        parsed.hostname === "ekodibiz.kr" ||
        parsed.hostname.endsWith(".ekodibiz.kr") ||
        parsed.hostname === "cheonggye-market.pages.dev")
    ) return origin;
  } catch {
    // fall through to canonical origin
  }
  return "https://auth.ekodi.kr";
};

const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigin(req.headers.get("Origin")),
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
});

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const clip = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);

async function authClient(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return null;
  const db = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { db, user: data.user };
}

async function subjectHash(subjectId: string) {
  const salt = Deno.env.get("TRUST_AUDIT_SALT");
  if (!salt) throw new Error("trust_audit_salt_missing");
  const bytes = new TextEncoder().encode(`${salt}:${subjectId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function accessAllowed(access: any) {
  if (access?.allowed === true) return true;
  return ["active", "pre_registered"].includes(String(access?.status ?? ""));
}

function workspaceIdOf(row: any) {
  return row?.workspace_id ?? row?.tenant_id ?? row?.id ?? null;
}

function rolesOf(access: any, workspaces: any[], workspaceId: string | null) {
  const roles = new Set<string>();
  const add = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(add);
    else if (value) roles.add(clip(value, 80));
  };
  add(access?.role);
  add(access?.roles);
  if (access?.platform_admin === true) roles.add("platform_admin");

  if (workspaceId) {
    const workspace = workspaces.find((row) => String(workspaceIdOf(row)) === workspaceId);
    add(workspace?.role);
    add(workspace?.roles);
  }
  return [...roles].filter(Boolean).sort();
}

function profileFor(roles: string[], purpose: string | null): ProjectionProfile {
  if (purpose === "experience") return "experience";
  if (purpose === "external-ai") return "external-AI";
  if (purpose === "agent-task") return "agent-task";
  if (roles.includes("platform_admin") || roles.includes("tenant_admin") || roles.includes("owner")) return "safe-admin";
  return "workspace-member";
}

async function shadowPolicy() {
  const { data, error } = await admin
    .from("trust_policy_versions")
    .select("policy_version,capability_schema_version,projection_version,config,status")
    .in("status", ["shadow", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  const auth = await authClient(req);
  if (!auth) return json(req, { error: "unauthorized" }, 401);

  try {
    const body = await req.json();
    if (body?.mode && body.mode !== "shadow") {
      return json(req, { error: "trust_enforcement_not_enabled", mode: "shadow" }, 409);
    }

    const site = clip(body?.site, 60);
    const resource = clip(body?.resource, 120);
    const action = clip(body?.action, 80);
    const workspaceId = clip(body?.workspace_id, 128) || null;
    const purpose = clip(body?.purpose, 120) || null;
    const risk = (["low", "medium", "high", "critical"].includes(body?.risk) ? body.risk : "low") as RiskLevel;
    if (!site || !resource || !action) {
      return json(req, { error: "site_resource_action_required" }, 400);
    }

    const [{ data: access, error: accessError }, { data: workspaces, error: workspacesError }, policy] = await Promise.all([
      auth.db.rpc("current_site_access", { p_site_key: site }),
      auth.db.rpc("current_site_workspaces", { p_site_key: site }),
      shadowPolicy(),
    ]);
    if (accessError) throw accessError;
    if (workspacesError) throw workspacesError;

    const workspaceRows = Array.isArray(workspaces) ? workspaces : [];
    if (workspaceId && !workspaceRows.some((row: any) => String(workspaceIdOf(row)) === workspaceId)) {
      return json(req, { error: "workspace_not_found_or_forbidden" }, 404);
    }

    const legacyAllowed = accessAllowed(access);
    const roles = rolesOf(access, workspaceRows, workspaceId);
    const context = buildSecurityContext({
      subjectId: auth.user.id,
      workspaceId,
      roles,
      service: site,
      resource,
      action,
      purpose,
      risk,
      attributes: {
        access_status: access?.status ?? null,
        workspace_selected: Boolean(workspaceId),
      },
    });

    const capabilities = capabilitySet({ roles, service: site, resource, action, legacyAllowed });
    const projectionProfile = profileFor(roles, purpose);
    const rules = Array.isArray(policy?.config?.rules) ? policy.config.rules as PolicyRule[] : [];
    const decision = rules.length
      ? evaluatePolicy(context, rules)
      : compatibilityDecision(legacyAllowed, {
        capabilities,
        projectionProfile,
        reason: "Initial Trust Layer shadow policy mirrors current EKODI authorization.",
      });
    const comparison = compareWithLegacy(legacyAllowed, decision, "shadow");

    const auditContext = safeAuditObject({
      roles,
      access_status: access?.status ?? null,
      workspace_selected: Boolean(workspaceId),
      risk,
    });

    const { error: auditError } = await admin.from("trust_shadow_decisions").insert({
      subject_hash: await subjectHash(auth.user.id),
      workspace_id: workspaceId,
      service: site,
      resource,
      action,
      purpose,
      risk,
      legacy_allowed: comparison.legacyAllowed,
      trust_allowed: comparison.trustAllowed,
      effective_allowed: comparison.effectiveAllowed,
      parity: comparison.parity,
      severity: comparison.severity,
      policy_version: policy?.policy_version ?? decision.policyVersion,
      capability_schema_version: policy?.capability_schema_version ?? decision.capabilitySchemaVersion,
      projection_version: policy?.projection_version ?? decision.projectionVersion,
      projection_profile: decision.projectionProfile,
      rule_id: decision.ruleId,
      context_summary: auditContext,
    });
    if (auditError) throw auditError;

    return json(req, {
      mode: "shadow",
      authoritative_source: "legacy",
      effective_allowed: comparison.effectiveAllowed,
      comparison,
      trust: {
        allowed: decision.allowed,
        rule_id: decision.ruleId,
        capabilities: decision.capabilities,
        projection_profile: decision.projectionProfile,
        versions: {
          policy: policy?.policy_version ?? TRUST_VERSIONS.policy,
          capability_schema: policy?.capability_schema_version ?? TRUST_VERSIONS.capabilitySchema,
          projection: policy?.projection_version ?? TRUST_VERSIONS.projection,
        },
      },
      context: secureProjection({
        workspace_id: workspaceId,
        roles,
        service: site,
        resource,
        action,
        purpose,
        risk,
      }),
    });
  } catch (error) {
    console.error("trust-api", error);
    return json(req, { error: "trust_shadow_evaluation_failed" }, 500);
  }
});
