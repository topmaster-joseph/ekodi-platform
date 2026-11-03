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
    paid_member: Boolean(row.paid_member_since) && row.status === "active",
    paid_member_since: row.paid_member_since || null,
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
  // Administrative preparation is independent of public enrollment and payment activation.
  // Only this exact operator-scoped allowlist is reachable before launch.
  const prelaunchAdmin = p === "/bank/admin/brokerage-readiness" && ["GET", "PUT"].includes(req.method) ||
    p === "/bank/admin/catalog" && req.method === "GET" ||
    /^\/bank\/admin\/catalog\/[a-z][a-z0-9_]{2,49}$/.test(p) && req.method === "PUT";
  if (!enabled() && !prelaunchAdmin) return reply(req, { error: "singles_enrollment_not_launched" }, 503);
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
    const email = typeof data.user.email === "string" ? data.user.email.slice(0, 320) : null;
    const admin = db(true);
    // 시범 운영(2026-10-28): 공개 개통(SINGLES_PUBLIC_LAUNCH_ENABLED=true) 전에는 시범 명단과 운영자만 회원 기능을 쓴다.
    if (Deno.env.get("SINGLES_PUBLIC_LAUNCH_ENABLED") !== "true") {
      const { data: pilot, error: pilotError } = await admin.from("singles_pilot_users").select("user_id").eq("user_id", userId).maybeSingle();
      if (pilotError) throw pilotError;
      const { data: op, error: opError } = await admin.from("singles_bank_operators").select("enabled").eq("user_id", userId).maybeSingle();
      if (opError) throw opError;
      if (!pilot && op?.enabled !== true) {
        // 소유자가 초대할 수 있도록 "이용을 시도한 계정"을 하루 한 번만 남긴다(실패해도 응답은 같다).
        try {
          const since = new Date(Date.now() - 86400000).toISOString();
          const { data: recent } = await admin.from("singles_signup_attempts").select("id").eq("user_id", userId)
            .eq("action", "pilot_denied").gte("created_at", since).limit(1);
          if (!recent?.length) await admin.from("singles_signup_attempts").insert({ user_id: userId, email, action: "pilot_denied", detail: null });
        } catch (_) { /* 기록 실패가 차단 응답을 바꾸지 않는다 */ }
        return reply(req, { error: "pilot_only" }, 403);
      }
    }
    // 가입 시도 기록(시간·Google 계정). 기록하지 못하면 가입을 진행하지 않는다.
    const logAttempt = async (action: string, detail: string | null = null) => {
      const { error: logError } = await admin.from("singles_signup_attempts")
        .insert({ user_id: userId, email, action, detail: detail ? detail.slice(0, 120) : null });
      if (logError) throw logError;
    };
    if (socialRoute && p.startsWith("/bank/")) return await handleSinglesBank(req, p, admin, userId, reply, email);
    if (socialRoute) return await handleSinglesSocial(req, p, admin, userId, reply);
    if (p === "/withdraw") {
      await logAttempt("withdraw");
      // Atomic: membership off, open connections closed (no revival on re-join),
      // pending/approved RSVPs cancelled, consent receipt written.
      const { error: withdrawError } = await admin.rpc("singles_withdraw_member", { p_user: userId, p_version: VERSION });
      if (withdrawError?.code === "P0002") return reply(req, { error: "member_not_found" }, 404);
      if (withdrawError) throw withdrawError;
      return reply(req, { ok: true, status: "withdrawn" });
    }
    const fields = "status,age_19_confirmed,adult_verified_at,base_consent,religion_consent,marriage_opt_in,consent_version,consented_at,withdrawn_at,paid_member_since";
    if (req.method === "GET") {
      const { data: member, error: readError } = await admin.from("singles_memberships")
        .select(fields).eq("user_id", userId).maybeSingle();
      if (readError) throw readError;
      return member ? reply(req, { member: safe(member) }) : reply(req, { error: "member_not_found" }, 404);
    }
    if (Number(req.headers.get("content-length") || 0) > 1024)
      return reply(req, { error: "payload_too_large" }, 413);
    const fail = async (code: string, status = 400) => { await logAttempt("enroll_failed", code); return reply(req, { error: code }, status); };
    let input: unknown;
    try { input = await req.json(); } catch { return await fail("invalid_json"); }
    if (!input || typeof input !== "object" || Array.isArray(input))
      return await fail("invalid_payload");
    const b = input as Record<string, unknown>;
    const allowed = new Set(["age_19_confirmed", "base_consent", "religion_consent", "marriage_opt_in"]);
    if (Object.keys(b).some(k => !allowed.has(k))) return await fail("unknown_field");
    if (b.age_19_confirmed !== true || b.base_consent !== true)
      return await fail("adult_declaration_and_base_consent_required");
    if (typeof b.religion_consent !== "boolean" || typeof b.marriage_opt_in !== "boolean")
      return await fail("explicit_optional_choices_required");
    // Dating/community operating mode: marriage-purpose connection is not offered
    // (결혼중개업 미신고 운영). Kept in the schema for a future registered brokerage.
    if (b.marriage_opt_in === true)
      return await fail("marriage_connection_not_offered");
    if (b.marriage_opt_in && !b.religion_consent)
      return await fail("religion_consent_required_for_marriage");
    const { data: link, error: linkError } = await admin.from("login_identities")
      .select("person_id").eq("auth_user_id", userId).eq("status", "active").maybeSingle();
    if (linkError) throw linkError;
    if (!link?.person_id) return await fail("core_identity_link_required", 409);
    await logAttempt("enroll");
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
      .insert({ user_id: userId, action: "enrolled", consent_version: VERSION,
        religion_consent: b.religion_consent, marriage_opt_in: b.marriage_opt_in });
    if (receiptError) throw receiptError;
    return reply(req, { member: safe(member) });
  } catch (err) {
    console.error("singles_api_error", { reason: err instanceof Error ? err.name : "unavailable" });
    return reply(req, { error: "service_unavailable" }, 503);
  }
});
