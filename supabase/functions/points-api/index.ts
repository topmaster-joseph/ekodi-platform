import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    if (path === "/admin/overview") {
      // Read-only operator dashboard: authority is checked in the database,
      // never derived from email, browser flags or editable user metadata.
      const { data: auth, error: authError } = await db.auth.getUser(bearer.slice(7));
      if (authError || !auth.user) return json(req, { error: "unauthorized" }, 401);
      const { data: admin, error: adminError } = await db.from("profiles")
        .select("user_id").eq("user_id", auth.user.id).eq("platform_admin", true)
        .maybeSingle();
      if (adminError) throw adminError;
      if (!admin) return json(req, { error: "admin_forbidden" }, 403);
      const [
        { data: sites, error: sitesError },
        { data: rules, error: rulesError },
        { data: transfers, error: transfersError },
        { data: campaigns, error: campaignsError },
      ] = await Promise.all([
        db.from("ekodi_point_sites")
          .select("site_id,display_name,enabled,daily_cap").order("site_id").limit(200),
        db.from("ekodi_point_rules")
          .select("site_id,rule_id,points,daily_cap,daily_events,min_active_seconds,enabled")
          .order("site_id").order("rule_id").limit(1000),
        db.from("ekodi_point_transfer_policies")
          .select("from_site,to_site,numerator,denominator,daily_cap,enabled")
          .order("from_site").order("to_site").limit(300),
        db.from("ekodi_point_donation_campaigns")
          .select("campaign_id,site_id,title,recipient_name,enabled,starts_at,ends_at")
          .order("site_id").limit(300),
      ]);
      if (sitesError || rulesError || transfersError || campaignsError) {
        throw sitesError || rulesError || transfersError || campaignsError;
      }
      return json(req, {
        sites: sites || [], rules: rules || [],
        transfers: transfers || [], campaigns: campaigns || [],
        read_only: true,
        snapshot_at: new Date().toISOString(),
      });
    }
    const personId = await resolvePerson(bearer.slice(7));
    if (!personId) return json(req, { error: "person_not_linked" }, 403);
    if (path !== "/" && path !== "/me" && path !== "/sites") return json(req, { error: "not_found" }, 404);
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
