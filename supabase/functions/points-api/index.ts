import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildPointProgress } from "./progress.mjs";

// Read-only point history API. No mutation RPC is exposed to browsers.
// Service credentials never leave this Edge Function.
const url = Deno.env.get("SUPABASE_URL")!;
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, secret, { auth: { persistSession: false } });
const ORIGINS = new Set([
  "https://ekodi.kr",
  "https://ekodi-my-staging.ekodi-development.workers.dev",
]);
const sitePattern = /^[a-z0-9_-]{2,64}$/;
function headers(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...headers(req), "Content-Type": "application/json; charset=utf-8" },
  });
}
async function resolvePerson(jwt: string): Promise<string | null> {
  const { data: auth, error: authError } = await db.auth.getUser(jwt);
  if (authError || !auth.user) return null;
  // Never match by email. The verified login is explicitly attached to a Person.
  const { data: link, error: linkError } = await db.from("login_identities")
    .select("person_id").eq("auth_user_id", auth.user.id).eq("status", "active")
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link?.person_id) return null;
  const { data: person, error: personError } = await db.from("people")
    .select("id").eq("id", link.person_id).eq("status", "active").maybeSingle();
  if (personError) throw personError;
  return person?.id || null;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (!ORIGINS.has(req.headers.get("Origin") || "")) return json(req, { error: "origin_not_allowed" }, 403);
  if (req.method !== "GET") return json(req, { error: "method_not_allowed" }, 405);
  const bearer = req.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);
  try {
    const requestUrl = new URL(req.url);
    const path = requestUrl.pathname.replace(/^\/points-api(?:-staging)?/, "") || "/";
    const personId = await resolvePerson(bearer.slice(7));
    if (!personId) return json(req, { error: "person_not_linked" }, 403);
    if (path !== "/" && path !== "/me" && path !== "/sites" && path !== "/progress") return json(req, { error: "not_found" }, 404);
    if (path === "/sites") {
      const { data: sites, error: listError } = await db.from("ekodi_point_sites")
        .select("site_id,display_name").eq("enabled", true)
        .order("display_name", { ascending: true }).limit(100);
      if (listError) throw listError;
      return json(req, { sites: (sites || []).map(row => ({
        id: row.site_id, name: row.display_name,
      })) });
    }
    const site = requestUrl.searchParams.get("site")?.trim() || "";
    if (!sitePattern.test(site)) return json(req, { error: "invalid_site" }, 400);
    const { data: siteInfo, error: siteError } = await db.from("ekodi_point_sites")
      .select("site_id,display_name").eq("site_id", site).eq("enabled", true).maybeSingle();
    if (siteError) throw siteError;
    if (!siteInfo) return json(req, { error: "site_not_available" }, 404);
    if (path === "/progress") {
      // An active site and canonical Person are mandatory before any read.
      // This is a non-monetary projection. Only server-verified, claimable
      // adapters are eligible; the endpoint never writes to the points ledger.
      const [{ data: adapters, error: adapterError }, { data: rules, error: ruleError }] = await Promise.all([
        db.from("ekodi_point_evidence_adapters").select("rule_id,adapter,trust,member_claimable,enabled")
          .eq("site_id", site).eq("enabled", true).eq("member_claimable", true).eq("trust", "verified"),
        db.from("ekodi_point_rules").select("rule_id,points,enabled")
          .eq("site_id", site).eq("enabled", true),
      ]);
      if (adapterError || ruleError) throw adapterError || ruleError;
      const active = (adapters || []).filter(row =>
        row.adapter !== "devotion_self_report" && row.adapter !== "attendance_checkin" &&
        (rules || []).some(rule => rule.rule_id === row.rule_id && rule.enabled === true));
      let claims: Array<{ rule_id: string; adapter: string; status: string; submitted_at: string }> = [];
      let truncated = false;
      if (active.length) {
        const since = new Date(Date.now() - 92 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await db.from("ekodi_point_evidence_claims")
          .select("rule_id,adapter,status,submitted_at")
          .eq("site_id", site).eq("person_id", personId)
          .gte("submitted_at", since).order("submitted_at", { ascending: false }).limit(1201);
        if (error) throw error;
        truncated = (data || []).length > 1200;
        claims = (data || []).slice(0, 1200);
      }
      return json(req, {
        site: { id: siteInfo.site_id, name: siteInfo.display_name },
        ...buildPointProgress({ now: new Date(), adapters: active, rules: rules || [], claims, truncated }),
      });
    }
    const limitRaw = Number(requestUrl.searchParams.get("limit") || "25");
    const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 25;
    const [{ data: wallet, error: walletError }, { data: rows, error: historyError }] = await Promise.all([
      db.from("ekodi_point_wallets").select("balance,updated_at")
        .eq("site_id", site).eq("user_id", personId).maybeSingle(),
      db.from("ekodi_point_ledger").select("id,amount,event_kind,rule_id,created_at")
        .eq("site_id", site).eq("user_id", personId)
        .order("id", { ascending: false }).limit(limit),
    ]);
    if (walletError || historyError) throw walletError || historyError;
    return json(req, {
      site: { id: siteInfo.site_id, name: siteInfo.display_name },
      balance: wallet?.balance ?? 0,
      updated_at: wallet?.updated_at ?? null,
      history: rows ?? [],
    });
  } catch (err) {
    console.error("points-api failed", err instanceof Error ? err.message : "unknown");
    return json(req, { error: "points_unavailable" }, 503);
  }
});
