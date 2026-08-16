import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_AI_TOKEN = Deno.env.get("EKODI_AI_CONTEXT_TOKEN") || "";
const CONTROL_API = "https://api.ekodi.kr";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const ALLOWED_ORIGINS = new Set(["https://admin.ekodi.kr", "https://ekodi.kr"]);
const CONTEXT_TYPES = new Set(["fact","observation","constraint","decision","report","opportunity","task"]);
const EVENT_TYPES = new Set(["observed","proposed","delegated","started","completed","failed","blocked","escalated","decided","reported","context_updated"]);
const SENSITIVITY = new Set(["public","internal","confidential","restricted"]);
const VISIBILITY = new Set(["ecosystem","restricted","agent"]);

function clean(value: unknown, max = 4000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}
function safeArray(value: unknown, max = 20) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => clean(item, 160)).filter(Boolean))].slice(0, max);
}
function safeServices(value: unknown) {
  return safeArray(value).filter(item => item === "ekodi.kr" || /^[a-z0-9.-]+\.ekodi\.kr$/.test(item));
}
function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://admin.ekodi.kr",
    "Access-Control-Allow-Headers": "authorization, content-type, x-ekodi-ai-token, x-ekodi-ai-agent",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors(req), "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" } });
}
function equalConstantTime(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function authenticate(req: Request) {
  const internal = req.headers.get("x-ekodi-ai-token") || "";
  const agent = clean(req.headers.get("x-ekodi-ai-agent") || "", 100);
  if (INTERNAL_AI_TOKEN && equalConstantTime(internal, INTERNAL_AI_TOKEN) && agent) {
    return { kind:"agent", actor:agent, agent };
  }
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  try {
    const response = await fetch(`${CONTROL_API}/api/session`, { headers:{ authorization, accept:"application/json" }, signal:AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const email = clean(data?.email, 320).toLowerCase();
    return email ? { kind:"admin", actor:email, agent:"Chief AI" } : null;
  } catch {
    return null;
  }
}
function sensitivityRank(value: string) {
  return ({ public:0, internal:1, confidential:2, restricted:3 } as Record<string,number>)[value] ?? 1;
}
function readableBy(auth: any, row: any) {
  if (auth.kind === "admin") return true;
  if (row.visibility === "agent" && !safeArray(row.related_agents).includes(auth.agent) && row.owner_agent !== auth.agent && row.source_agent !== auth.agent) return false;
  if (row.visibility === "restricted" && row.owner_agent !== auth.agent && row.source_agent !== auth.agent && !safeArray(row.related_agents).includes(auth.agent)) return false;
  if (sensitivityRank(row.sensitivity) >= 3 && row.owner_agent !== auth.agent && row.source_agent !== auth.agent && !safeArray(row.related_agents).includes(auth.agent)) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers:cors(req) });
  const auth = await authenticate(req);
  if (!auth) return json(req, { error:"unauthorized" }, 401);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ai-context-hub/, "") || "/";

  try {
    if (req.method === "GET" && path === "/context") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40)));
      let query = admin.from("ai_shared_context")
        .select("id,context_type,visibility,sensitivity,source_agent,owner_agent,subject_type,subject_key,title,summary,payload,related_services,related_agents,confidence,status,valid_from,expires_at,supersedes_id,created_at,updated_at")
        .in("status", ["active","resolved"])
        .order("updated_at", { ascending:false })
        .limit(limit * 2);
      const service = clean(url.searchParams.get("service"), 160).toLowerCase();
      if (service) query = query.contains("related_services", [service]);
      const type = clean(url.searchParams.get("type"), 40);
      if (type && CONTEXT_TYPES.has(type)) query = query.eq("context_type", type);
      const { data, error } = await query;
      if (error) throw error;
      return json(req, { context:(data || []).filter(row => readableBy(auth, row)).slice(0, limit) });
    }

    if (req.method === "POST" && path === "/context") {
      const body = await req.json().catch(() => ({}));
      const contextType = clean(body?.context_type, 40);
      const title = clean(body?.title, 240);
      const summary = clean(body?.summary, 4000);
      if (!CONTEXT_TYPES.has(contextType) || !title || !summary) return json(req, { error:"invalid_context" }, 400);
      const sensitivity = SENSITIVITY.has(clean(body?.sensitivity, 30)) ? clean(body?.sensitivity, 30) : "internal";
      const visibility = VISIBILITY.has(clean(body?.visibility, 30)) ? clean(body?.visibility, 30) : "ecosystem";
      const sourceAgent = auth.kind === "agent" ? auth.agent : clean(body?.source_agent || "Chief AI", 100);
      const row = {
        context_type:contextType,
        visibility,
        sensitivity,
        source_agent:sourceAgent,
        owner_agent:clean(body?.owner_agent, 100) || null,
        subject_type:clean(body?.subject_type, 80) || "ecosystem",
        subject_key:clean(body?.subject_key, 200) || "ekodi",
        title,
        summary,
        payload:typeof body?.payload === "object" && body?.payload ? body.payload : {},
        related_services:safeServices(body?.related_services),
        related_agents:safeArray(body?.related_agents),
        confidence:Math.min(1, Math.max(0, Number(body?.confidence ?? 1))),
        status:"active",
        expires_at:body?.expires_at || null,
        supersedes_id:body?.supersedes_id || null,
      };
      const { data, error } = await admin.from("ai_shared_context").insert(row).select("*").single();
      if (error) throw error;
      await admin.from("ai_collaboration_events").insert({ event_type:"context_updated", source_agent:sourceAgent, target_agents:row.related_agents, context_id:data.id, sensitivity, summary:title, related_services:row.related_services, payload:{ actor:auth.actor } });
      return json(req, { context:data }, 201);
    }

    if (req.method === "GET" && path === "/events") {
      const after = Math.max(0, Number(url.searchParams.get("after") || 0));
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
      const { data, error } = await admin.from("ai_collaboration_events")
        .select("id,event_type,source_agent,target_agents,context_id,correlation_id,sensitivity,summary,payload,related_services,created_at")
        .gt("id", after).order("id", { ascending:true }).limit(limit * 2);
      if (error) throw error;
      const events = (data || []).filter(row => auth.kind === "admin" || !row.target_agents?.length || row.target_agents.includes(auth.agent) || row.source_agent === auth.agent).slice(0, limit);
      return json(req, { events });
    }

    if (req.method === "POST" && path === "/events") {
      const body = await req.json().catch(() => ({}));
      const eventType = clean(body?.event_type, 40);
      const summary = clean(body?.summary, 4000);
      if (!EVENT_TYPES.has(eventType) || !summary) return json(req, { error:"invalid_event" }, 400);
      const sensitivity = SENSITIVITY.has(clean(body?.sensitivity, 30)) ? clean(body?.sensitivity, 30) : "internal";
      const sourceAgent = auth.kind === "agent" ? auth.agent : clean(body?.source_agent || "Chief AI", 100);
      const row = {
        event_type:eventType,
        source_agent:sourceAgent,
        target_agents:safeArray(body?.target_agents),
        context_id:body?.context_id || null,
        sensitivity,
        summary,
        payload:typeof body?.payload === "object" && body?.payload ? body.payload : {},
        related_services:safeServices(body?.related_services),
      };
      const { data, error } = await admin.from("ai_collaboration_events").insert(row).select("*").single();
      if (error) throw error;
      return json(req, { event:data }, 201);
    }

    if (req.method === "POST" && path === "/cursor") {
      const body = await req.json().catch(() => ({}));
      const agentKey = auth.kind === "agent" ? auth.agent : clean(body?.agent_key || "Chief AI", 100);
      const lastEventId = Math.max(0, Number(body?.last_event_id || 0));
      const { data, error } = await admin.from("ai_agent_cursors").upsert({ agent_key:agentKey, last_event_id:lastEventId, updated_at:new Date().toISOString() }, { onConflict:"agent_key" }).select("*").single();
      if (error) throw error;
      return json(req, { cursor:data });
    }

    if (req.method === "GET" && path === "/snapshot") {
      const { data:context, error:contextError } = await admin.from("ai_shared_context")
        .select("id,context_type,visibility,sensitivity,source_agent,owner_agent,title,summary,related_services,related_agents,confidence,status,updated_at")
        .eq("status", "active").order("updated_at", { ascending:false }).limit(120);
      if (contextError) throw contextError;
      const visible = (context || []).filter(row => readableBy(auth, row));
      const grouped = visible.reduce((acc:Record<string,number>, row:any) => { acc[row.context_type] = (acc[row.context_type] || 0) + 1; return acc; }, {});
      return json(req, { generated_at:new Date().toISOString(), actor:auth.actor, counts:grouped, context:visible.slice(0, 60) });
    }

    return json(req, { error:"not_found" }, 404);
  } catch (error) {
    console.error("ai-context-hub", String((error as Error)?.message || error));
    return json(req, { error:"context_hub_failed" }, 500);
  }
});
