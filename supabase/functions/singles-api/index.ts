// EKODI Singles M1 — no production enrollment unless BOTH Worker and Edge flags are enabled.
// Sensitive faith answers, matching, discovery and messaging are intentionally not implemented.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleSinglesSocial } from "./social.ts";
import { handleSinglesBank } from "./bank-transfer.ts";
const ORIGIN = "https://ekodi.kr";
const VERSION = "singles-m1-2026-10-09-draft";
const enabled = () => Deno.env.get("SINGLES_ONBOARDING_ENABLED") === "true";
function headers(req: Request) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "vary": "origin",
    ...(req.headers.get("origin") === ORIGIN ? {
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, apikey",
    } : {}),
  };
}
const reply = (req: Request, value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: headers(req) });
function db(privileged = false) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get(privileged ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("database_unconfigured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function safe(row: any) {
  if (!row) return null;
  return {
    status: row.status,
    age_19_confirmed: row.age_19_confirmed === true,
    adult_verified: Boolean(row.adult_verified_at),
    base_consent: row.base_consent === true,
    religion_consent: row.religion_consent === true,
    marriage_opt_in: row.marriage_opt_in === true,
    discoverable: false,
    consent_version: row.consent_version,
    consented_at: row.consented_at,
    withdrawn_at: row.withdrawn_at,
  };
}
function path(req: Request) {
  const pathname = new URL(req.url).pathname;
  return pathname.replace(/^\/(?:functions\/v1\/)?singles-api\/?/, "/");
}
Deno.serve(async req => {
  const p = path(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.headers.get("origin") && req.headers.get("origin") !== ORIGIN)
    return reply(req, { error: "origin_not_allowed" }, 403);
  if (req.method === "GET" && p === "/health")
    return reply(req, { ok: true, enrollment_enabled: enabled(), version: VERSION });
  if (!enabled()) return reply(req, { error: "singles_enrollment_not_launched" }, 503);
  const socialRoute = !["/me", "/withdraw"].includes(p);
  if (!socialRoute && !["/me", "/withdraw"].includes(p)) return reply(req, { error: "not_found" }, 404);
  if (!socialRoute && !((p === "/me" && ["GET", "PUT"].includes(req.method)) || (p === "/withdraw" && req.method === "DELETE")))
    return reply(req, { error: "method_not_allowed" }, 405);
  try {
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return reply(req, { error: "unauthorized" }, 401);
    const { data, error } = await db().auth.getUser(bearer);
    if (error || !data.user || data.user.is_anonymous) return reply(req, { error: "unauthorized" }, 401);
    const userId = data.user.id;
    const admin = db(true);
    if (socialRoute && p.startsWith("/bank/")) return await handleSinglesBank(req, p, admin, userId, reply);
    if (socialRoute) return await handleSinglesSocial(req, p, admin, userId, reply);
    if (p === "/withdraw") {
      const { error: updateError } = await admin.from("singles_memberships").update({
        status: "withdrawn", discoverable: false, marriage_opt_in: false,
        religion_consent: false, base_consent: false, withdrawn_at: new Date().toISOString(),
      }).eq("user_id", userId);
      if (updateError) throw updateError;
      const { error: receiptError } = await admin.from("singles_consent_receipts")
        .insert({ user_id: userId, action: "withdrawn", consent_version: VERSION });
      if (receiptError) throw receiptError;
      return reply(req, { ok: true, status: "withdrawn" });
    }
    const fields = "status,age_19_confirmed,adult_verified_at,base_consent,religion_consent,marriage_opt_in,consent_version,consented_at,withdrawn_at";
    if (req.method === "GET") {
      const { data: member, error: readError } = await admin.from("singles_memberships")
        .select(fields).eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      return member ? reply(req, { member: safe(member) }) : reply(req, { error: "member_not_found" }, 404);
    }
    if (Number(req.headers.get("content-length") || 0) > 1024)
      return reply(req, { error: "payload_too_large" }, 413);
    let input: unknown;
    try { input = await req.json(); } catch { return reply(req, { error: "invalid_json" }, 400); }
    if (!input || typeof input !== "object" || Array.isArray(input))
      return reply(req, { error: "invalid_payload" }, 400);
    const b = input as Record<string, unknown>;
    const allowed = new Set(["age_19_confirmed", "base_consent", "religion_consent", "marriage_opt_in"]);
    if (Object.keys(b).some(k => !allowed.has(k))) return reply(req, { error: "unknown_field" }, 400);
    if (b.age_19_confirmed !== true || b.base_consent !== true)
      return reply(req, { error: "adult_declaration_and_base_consent_required" }, 400);
    if (typeof b.religion_consent !== "boolean" || typeof b.marriage_opt_in !== "boolean")
      return reply(req, { error: "explicit_optional_choices_required" }, 400);
    if (b.marriage_opt_in && !b.religion_consent)
      return reply(req, { error: "religion_consent_required_for_marriage" }, 400);
    const { data: link, error: linkError } = await admin.from("login_identities")
      .select("person_id").eq("auth_user_id", userId).eq("status", "active").maybeSingle();
    if (linkError) throw linkError;
    if (!link?.person_id) return reply(req, { error: "core_identity_link_required" }, 409);
    const row = {
      user_id: userId, person_id: link.person_id, status: "active",
      age_19_confirmed: true, base_consent: true,
      religion_consent: b.religion_consent, marriage_opt_in: b.marriage_opt_in,
      discoverable: false, consent_version: VERSION,
      consented_at: new Date().toISOString(), withdrawn_at: null,
    };
    const { data: member, error: writeError } = await admin.from("singles_memberships")
      .upsert(row, { onConflict: "user_id" }).select(fields).single();
    if (writeError) throw writeError;
    const { error: receiptError } = await admin.from("singles_consent_receipts")
      .insert({ user_id: userId, action: "enrolled", consent_version: VERSION });
    if (receiptError) throw receiptError;
    return reply(req, { member: safe(member) });
  } catch (err) {
    console.error("singles_api_error", { reason: err instanceof Error ? err.name : "unavailable" });
    return reply(req, { error: "service_unavailable" }, 503);
  }
});
