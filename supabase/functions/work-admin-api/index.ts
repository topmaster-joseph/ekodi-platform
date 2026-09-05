import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  buildSecurityContext,
  compareWithLegacy,
  compatibilityDecision,
  evaluatePolicy,
  safeAuditObject,
  selectCoveredPolicy,
  type PolicyRule,
  type RiskLevel,
  type TrustPolicyVersion,
} from "../_shared/trust.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("supabase_admin_environment_missing");
const SESSION_URL = "https://api.ekodi.kr/api/session";
const WORK_HEALTH_URL = "https://work.ekodi.kr/health";
const WORK_ADMIN_TRUST_POLICY = "trust_policy_v3";
const ALLOWED_ORIGINS = new Set([
  "https://admin.ekodi.kr",
  "https://admin.biz.ekodi.kr",
  "https://admin.church.ekodi.kr",
  "https://admin.lab.ekodi.kr",
  "https://admin.trade.ekodi.kr",
]);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(req) {
  const origin = req.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function verifyEkodiAdmin(req) {
  const origin = req.headers.get("Origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return null;
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(SESSION_URL, {
    method: "GET",
    headers: {
      authorization,
      origin: "https://admin.ekodi.kr",
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const session = await response.json().catch(() => null);
  if (!session?.email) return null;
  const rawAuthority = session?.authority && typeof session.authority === "object" ? session.authority : null;
  const authority = rawAuthority && Array.isArray(rawAuthority.capabilities)
    ? {
      role: String(rawAuthority.role || session.role || "viewer").toLowerCase(),
      scope: rawAuthority.scope && typeof rawAuthority.scope === "object" ? rawAuthority.scope : null,
      capabilities: rawAuthority.capabilities.map(value => String(value || "").toLowerCase()).filter(Boolean),
      deniedCapabilities: Array.isArray(rawAuthority.deniedCapabilities)
        ? rawAuthority.deniedCapabilities.map(value => String(value || "").toLowerCase()).filter(Boolean)
        : [],
      elevated: rawAuthority.elevated === true,
      elevatedUntil: rawAuthority.elevatedUntil || null,
    }
    : null;
  return {
    email: String(session.email).toLowerCase(),
    name: String(session.name || session.displayName || "관리자"),
    role: String(authority?.role || session.role || "viewer").toLowerCase(),
    authority,
  };
}

async function trustAuditSalt() {
  const configured = Deno.env.get("TRUST_AUDIT_SALT")?.trim();
  if (configured) return configured;
  const { data, error } = await admin.rpc("trust_runtime_audit_salt");
  if (error || typeof data !== "string" || data.length < 32) throw new Error("trust_audit_salt_missing");
  return data;
}

async function trustSubjectHash(subjectId) {
  const salt = await trustAuditSalt();
  const bytes = new TextEncoder().encode(`${salt}:${subjectId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function workAdminCandidatePolicy() {
  const { data, error } = await admin.from("trust_policy_versions")
    .select("policy_version,capability_schema_version,projection_version,config,status,created_at")
    .eq("policy_version", WORK_ADMIN_TRUST_POLICY)
    .in("status", ["draft", "shadow", "active"])
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TrustPolicyVersion | null;
}

async function observeWorkAdminTrustShadow(adminSession, action: "job.moderate" | "organization.verify", risk: RiskLevel = "high") {
  try {
    const legacyAllowed = true;
    const authority = adminSession.authority;
    const context = buildSecurityContext({
      subjectId: adminSession.email,
      roles: [adminSession.role].filter(Boolean),
      authorityCapabilities: authority?.capabilities ?? [],
      deniedCapabilities: authority?.deniedCapabilities ?? [],
      elevated: authority?.elevated === true,
      service: "work",
      resource: "work-admin",
      action,
      purpose: "authorization-migration",
      risk,
      attributes: {
        migration_surface: "work-admin-api",
        legacy_predicate: "verified_admin_session",
        authority_source: authority ? "api-session-authority" : "session-only",
      },
    });
    const policy = await workAdminCandidatePolicy();
    const selected = authority && policy ? selectCoveredPolicy(context, [policy]) : null;
    const rules = Array.isArray(selected?.config?.rules) ? selected.config.rules as PolicyRule[] : [];
    const candidateCovered = Boolean(selected && rules.length > 0);
    const decision = candidateCovered
      ? evaluatePolicy(context, rules)
      : compatibilityDecision(legacyAllowed, {
        capabilities: [],
        projectionProfile: "safe-admin",
        reason: authority
          ? "Work Admin candidate policy unavailable or outside coverage; mirrored verified admin session."
          : "Admin session did not expose canonical authority; mirrored verified admin session.",
      });
    const comparison = compareWithLegacy(legacyAllowed, decision, "shadow");
    const { error: auditError } = await admin.from("trust_shadow_decisions").insert({
      subject_hash: await trustSubjectHash(adminSession.email),
      workspace_id: null,
      service: "work",
      resource: "work-admin",
      action,
      purpose: "authorization-migration",
      risk,
      legacy_allowed: comparison.legacyAllowed,
      trust_allowed: comparison.trustAllowed,
      effective_allowed: comparison.effectiveAllowed,
      parity: comparison.parity,
      severity: comparison.severity,
      policy_version: selected?.policy_version ?? decision.policyVersion,
      capability_schema_version: selected?.capability_schema_version ?? decision.capabilitySchemaVersion,
      projection_version: selected?.projection_version ?? decision.projectionVersion,
      projection_profile: decision.projectionProfile,
      rule_id: decision.ruleId,
      context_summary: safeAuditObject({
        role: adminSession.role,
        migration_surface: "work-admin-api",
        legacy_predicate: "verified_admin_session",
        authority_source: authority ? "api-session-authority" : "session-only",
        authority_scope_type: authority?.scope?.type ?? null,
        elevated: authority?.elevated === true,
        candidate_policy_covered: candidateCovered,
        required_capability: "service:operate",
      }),
    });
    if (auditError) throw auditError;
    if (comparison.severity !== "ok") {
      console.warn("work-admin trust shadow divergence", { action, role: adminSession.role, severity: comparison.severity, parity: comparison.parity });
    }
  } catch (error) {
    // Shadow telemetry is never allowed to alter the existing verified-admin authorization result.
    console.error("work-admin trust shadow observation failed", error);
  }
}

function pathOf(req) {
  const pathname = new URL(req.url).pathname;
  return pathname.replace(/^\/(?:functions\/v1\/)?work-admin-api/, "") || "/";
}

function limitOf(req) {
  const value = Number(new URL(req.url).searchParams.get("limit") || 80);
  return Math.max(1, Math.min(200, Math.trunc(value) || 80));
}

function queryOf(req) {
  return String(new URL(req.url).searchParams.get("q") || "").trim().toLocaleLowerCase("ko-KR").slice(0, 120);
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function count(table, column, value) {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  if (column) query = query.eq(column, value);
  const { count: total, error } = await query;
  if (error) throw error;
  return Number(total || 0);
}

async function summary(req) {
  const [
    profilesTotal, discoverable, organizationsTotal, verified, jobsTotal, published, draft, closed,
    applicationsTotal, submitted, reviewing, interview, accepted, rejected, withdrawn,
  ] = await Promise.all([
    count("work_profiles"), count("work_profiles", "discoverable", true),
    count("work_organizations"), count("work_organizations", "verified", true),
    count("work_jobs"), count("work_jobs", "status", "published"), count("work_jobs", "status", "draft"), count("work_jobs", "status", "closed"),
    count("work_applications"), count("work_applications", "status", "submitted"), count("work_applications", "status", "reviewing"),
    count("work_applications", "status", "interview"), count("work_applications", "status", "accepted"), count("work_applications", "status", "rejected"), count("work_applications", "status", "withdrawn"),
  ]);
  return json(req, {
    generatedAt: new Date().toISOString(),
    profiles: { total: profilesTotal, discoverable },
    organizations: { total: organizationsTotal, verified, pending: Math.max(0, organizationsTotal - verified) },
    jobs: { total: jobsTotal, published, draft, closed },
    applications: { total: applicationsTotal, submitted, reviewing, interview, accepted, rejected, withdrawn },
  });
}

async function listJobs(req) {
  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") || "").trim();
  let query = admin.from("work_jobs")
    .select("id,organization_id,title,summary,category,employment_type,region,location_text,schedule_text,wage_type,wage_amount,currency,status,published_at,created_at,updated_at,work_organizations(name,verified)")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limitOf(req), 120));
  if (["draft", "published", "closed"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const jobIds = rows.map(row => row.id);
  const counts = new Map();
  if (jobIds.length) {
    const { data: applications, error: appError } = await admin.from("work_applications").select("job_id").in("job_id", jobIds);
    if (appError) throw appError;
    for (const item of applications || []) counts.set(item.job_id, (counts.get(item.job_id) || 0) + 1);
  }
  const q = queryOf(req);
  const filtered = rows.filter(row => {
    if (!q) return true;
    const org = Array.isArray(row.work_organizations) ? row.work_organizations[0] : row.work_organizations;
    return [row.title, row.region, row.category, org?.name].some(value => String(value || "").toLocaleLowerCase("ko-KR").includes(q));
  }).slice(0, limitOf(req));
  return json(req, { jobs: filtered.map(row => {
    const org = Array.isArray(row.work_organizations) ? row.work_organizations[0] : row.work_organizations;
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category,
      employmentType: row.employment_type,
      region: row.region,
      location: row.location_text,
      schedule: row.schedule_text,
      wageType: row.wage_type,
      wageAmount: row.wage_amount,
      currency: row.currency,
      status: row.status,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      organization: { name: org?.name || "사업장", verified: Boolean(org?.verified) },
      applicationCount: counts.get(row.id) || 0,
    };
  }) });
}

async function listApplications(req) {
  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") || "").trim();
  let query = admin.from("work_applications")
    .select("id,job_id,applicant_user_id,message,status,created_at,updated_at,work_jobs(title,region,work_organizations(name))")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limitOf(req), 120));
  if (["submitted", "reviewing", "interview", "accepted", "rejected", "withdrawn"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const userIds = [...new Set(rows.map(row => row.applicant_user_id).filter(Boolean))];
  const profileMap = new Map();
  if (userIds.length) {
    const { data: profiles, error: profileError } = await admin.from("work_profiles")
      .select("user_id,display_name,region,skills,languages")
      .in("user_id", userIds);
    if (profileError) throw profileError;
    for (const profile of profiles || []) profileMap.set(profile.user_id, profile);
  }
  const q = queryOf(req);
  const result = rows.map(row => {
    const profile = profileMap.get(row.applicant_user_id) || {};
    const job = Array.isArray(row.work_jobs) ? row.work_jobs[0] : row.work_jobs;
    const orgRaw = job?.work_organizations;
    const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
    return {
      id: row.id,
      jobId: row.job_id,
      jobTitle: job?.title || "채용공고",
      organizationName: org?.name || "사업장",
      applicantName: profile.display_name || "지원자",
      applicantRegion: profile.region || "",
      applicantSkills: profile.skills || [],
      applicantLanguages: profile.languages || [],
      message: row.message || "",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }).filter(row => !q || [row.jobTitle, row.organizationName, row.applicantName, row.applicantRegion].some(value => String(value || "").toLocaleLowerCase("ko-KR").includes(q)))
    .slice(0, limitOf(req));
  return json(req, { applications: result });
}

async function listOrganizations(req) {
  const url = new URL(req.url);
  const verified = String(url.searchParams.get("verified") || "").trim();
  let query = admin.from("work_organizations")
    .select("id,owner_user_id,name,region,verified,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limitOf(req), 120));
  if (verified === "true" || verified === "false") query = query.eq("verified", verified === "true");
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const ownerIds = rows.map(row => row.owner_user_id).filter(Boolean);
  const orgIds = rows.map(row => row.id);
  const profileMap = new Map();
  const jobCounts = new Map();
  if (ownerIds.length) {
    const { data: profiles, error: profileError } = await admin.from("work_profiles").select("user_id,display_name").in("user_id", ownerIds);
    if (profileError) throw profileError;
    for (const profile of profiles || []) profileMap.set(profile.user_id, profile);
  }
  if (orgIds.length) {
    const { data: jobs, error: jobError } = await admin.from("work_jobs").select("organization_id").in("organization_id", orgIds);
    if (jobError) throw jobError;
    for (const job of jobs || []) jobCounts.set(job.organization_id, (jobCounts.get(job.organization_id) || 0) + 1);
  }
  const q = queryOf(req);
  return json(req, { organizations: rows.map(row => ({
    id: row.id,
    name: row.name,
    region: row.region,
    verified: Boolean(row.verified),
    ownerName: profileMap.get(row.owner_user_id)?.display_name || "사업주",
    jobCount: jobCounts.get(row.id) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })).filter(row => !q || [row.name, row.region, row.ownerName].some(value => String(value || "").toLocaleLowerCase("ko-KR").includes(q))).slice(0, limitOf(req)) });
}

async function listProfiles(req) {
  const url = new URL(req.url);
  const role = String(url.searchParams.get("role") || "").trim();
  let query = admin.from("work_profiles")
    .select("display_name,role,region,skills,languages,visa_status,discoverable,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limitOf(req), 120));
  if (["seeker", "employer", "both"].includes(role)) query = query.eq("role", role);
  const { data, error } = await query;
  if (error) throw error;
  const q = queryOf(req);
  return json(req, { profiles: (data || []).filter(row => !q || [row.display_name, row.region, row.role, ...(row.skills || []), ...(row.languages || [])].some(value => String(value || "").toLocaleLowerCase("ko-KR").includes(q))).slice(0, limitOf(req)).map(row => ({
    displayName: row.display_name,
    role: row.role,
    region: row.region,
    skills: row.skills || [],
    languages: row.languages || [],
    visaStatus: row.visa_status || "",
    discoverable: Boolean(row.discoverable),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) });
}

async function security(req) {
  const tableChecks = await Promise.all(["work_profiles", "work_organizations", "work_jobs", "work_applications"].map(async table => {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    return { table, reachable: !error, detail: error?.message || "" };
  }));
  let serviceHealth = null;
  try {
    const response = await fetch(WORK_HEALTH_URL, { headers: { accept: "application/json" }, cache: "no-store" });
    serviceHealth = response.ok ? await response.json().catch(() => ({ ok: true, httpStatus: response.status })) : { ok: false, httpStatus: response.status };
  } catch (error) {
    serviceHealth = { ok: false, error: String(error?.message || error) };
  }
  return json(req, {
    generatedAt: new Date().toISOString(),
    adminApi: "authenticated",
    database: tableChecks,
    policyContract: "repository-validated",
    serviceHealth,
  });
}

async function audit(adminSession, action, resourceType, resourceId, reason, detail = {}) {
  const { error } = await admin.from("work_admin_audit").insert({
    admin_email: adminSession.email,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    reason,
    detail,
  });
  if (error) throw error;
}

async function moderateJob(req, adminSession, id) {
  if (!uuid(id)) return json(req, { error: "invalid_job_id" }, 400);
  const body = await req.json().catch(() => ({}));
  const status = String(body?.status || "").trim();
  const reason = String(body?.reason || "").trim().slice(0, 300);
  if (!["draft", "closed"].includes(status)) return json(req, { error: "admin_can_only_unpublish_or_close" }, 400);
  if (reason.length < 3) return json(req, { error: "moderation_reason_required" }, 400);
  const { data: current, error: currentError } = await admin.from("work_jobs").select("id,title,status").eq("id", id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return json(req, { error: "job_not_found" }, 404);
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === "draft") patch.published_at = null;
  const { data, error } = await admin.from("work_jobs").update(patch).eq("id", id).select("id,title,status,updated_at").single();
  if (error) throw error;
  await audit(adminSession, status === "closed" ? "job.close" : "job.unpublish", "job", id, reason, { previousStatus: current.status, title: current.title });
  return json(req, { job: data });
}

async function verifyOrganization(req, adminSession, id) {
  if (!uuid(id)) return json(req, { error: "invalid_organization_id" }, 400);
  const body = await req.json().catch(() => ({}));
  const verified = body?.verified === true;
  const reason = String(body?.reason || "").trim().slice(0, 300);
  if (reason.length < 3) return json(req, { error: "verification_reason_required" }, 400);
  const { data: current, error: currentError } = await admin.from("work_organizations").select("id,name,verified").eq("id", id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) return json(req, { error: "organization_not_found" }, 404);
  const { data, error } = await admin.from("work_organizations").update({ verified, updated_at: new Date().toISOString() }).eq("id", id).select("id,name,region,verified,updated_at").single();
  if (error) throw error;
  await audit(adminSession, verified ? "organization.verify" : "organization.unverify", "organization", id, reason, { previousVerified: current.verified, name: current.name });
  return json(req, { organization: data });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "origin_not_allowed" }, 403);
    return new Response(null, { status: 204, headers: cors(req) });
  }
  try {
    const adminSession = await verifyEkodiAdmin(req);
    if (!adminSession) return json(req, { error: "unauthorized" }, 401);
    const path = pathOf(req);
    if (req.method === "GET" && (path === "/" || path === "/summary")) return await summary(req);
    if (req.method === "GET" && path === "/jobs") return await listJobs(req);
    if (req.method === "GET" && path === "/applications") return await listApplications(req);
    if (req.method === "GET" && path === "/organizations") return await listOrganizations(req);
    if (req.method === "GET" && path === "/profiles") return await listProfiles(req);
    if (req.method === "GET" && path === "/security") return await security(req);
    const jobMatch = path.match(/^\/jobs\/([0-9a-f-]+)$/i);
    if (req.method === "PATCH" && jobMatch) {
      await observeWorkAdminTrustShadow(adminSession, "job.moderate", "high");
      return await moderateJob(req, adminSession, jobMatch[1]);
    }
    const organizationMatch = path.match(/^\/organizations\/([0-9a-f-]+)$/i);
    if (req.method === "PATCH" && organizationMatch) {
      await observeWorkAdminTrustShadow(adminSession, "organization.verify", "high");
      return await verifyOrganization(req, adminSession, organizationMatch[1]);
    }
    return json(req, { error: "not_found" }, 404);
  } catch (error) {
    console.error("work-admin-api", error);
    return json(req, { error: "work_admin_api_failed" }, 500);
  }
});