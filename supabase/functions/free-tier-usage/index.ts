import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPECTED_REPOSITORY = "topmaster-joseph/ekodi-platform";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_AUDIENCE = "ekodi-free-tier-governor";
const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks")
);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

async function authorize(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, GITHUB_JWKS, {
      issuer: GITHUB_ISSUER,
      audience: EXPECTED_AUDIENCE,
    });
    if (payload.repository !== EXPECTED_REPOSITORY) return null;
    if (payload.ref !== EXPECTED_REF) return null;
    const eventName = String(payload.event_name || "");
    if (!["push", "schedule", "workflow_dispatch"].includes(eventName)) return null;
    return payload;
  } catch (error) {
    console.warn("free-tier-usage oidc rejected", error instanceof Error ? error.message : String(error));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const claims = await authorize(req);
  if (!claims) return json({ error: "github_actions_oidc_required" }, 401);

  const { data, error } = await admin.rpc("ekodi_free_tier_usage");
  if (error) {
    console.error("free-tier-usage rpc", error);
    return json({ error: "usage_measurement_failed" }, 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const databaseBytes = Number(row?.database_bytes);
  const storageObjectBytes = Number(row?.storage_object_bytes);
  if (!Number.isFinite(databaseBytes) || !Number.isFinite(storageObjectBytes)) {
    return json({ error: "usage_measurement_invalid" }, 500);
  }

  return json({
    database_bytes: databaseBytes,
    storage_object_bytes: storageObjectBytes,
    measured_at: row?.measured_at || new Date().toISOString(),
    source: "supabase-edge-github-oidc",
  });
});
