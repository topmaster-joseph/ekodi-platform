import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth:{ persistSession:false } });
const CONTEXT_TYPES = new Set(["fact","observation","constraint","decision","report","opportunity","task"]);
const EVENT_TYPES = new Set(["observed","proposed","delegated","started","completed","failed","blocked","escalated","decided","reported","context_updated"]);

function clean(value: unknown, max = 4000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function safeArray(value: unknown, max = 20) { return Array.isArray(value) ? [...new Set(value.map(item => clean(item, 160)).filter(Boolean))].slice(0, max) : []; }
function safeServices(value: unknown) { return safeArray(value).filter(item => item === "ekodi.kr" || /^[a-z0-9.-]+\.ekodi\.kr$/.test(item)); }
function constantTimeEqual(a:string, b:string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0;
}
function json(body:unknown, status=200) { return new Response(JSON.stringify(body), { status, headers:{ "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" } }); }
function authorize(req:Request) {
  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : "";
  const agent = clean(req.headers.get("x-ekodi-ai-agent"), 100);
  if (!agent || !constantTimeEqual(bearer, SERVICE_ROLE)) return null;
  return { agent };
}

Deno.serve(async (req:Request) => {
  const auth = authorize(req);
  if (!auth) return json({ error:"server_agent_unauthorized" }, 401);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ai-context-agent/, "") || "/";
  try {
    if (req.method === "GET" && path === "/snapshot") {
      const after = Math.max(0, Number(url.searchParams.get("after") || 0));
      const { data:context, error:contextError } = await admin.from("ai_shared_context")
        .select("id,context_type,visibility,sensitivity,source_agent,owner_agent,subject_type,subject_key,title,summary,payload,related_services,related_agents,confidence,status,valid_from,expires_at,updated_at")
        .eq("status", "active").order("updated_at", { ascending:false }).limit(100);
      if (contextError) throw contextError;
      const visible = (context || []).filter((row:any) => {
        if (row.visibility === "ecosystem" && row.sensitivity !== "restricted") return true;
        return row.source_agent === auth.agent || row.owner_agent === auth.agent || safeArray(row.related_agents).includes(auth.agent);
      });
      const { data:events, error:eventError } = await admin.from("ai_collaboration_events")
        .select("id,event_type,source_agent,target_agents,context_id,correlation_id,sensitivity,summary,payload,related_services,created_at")
        .gt("id", after).order("id", { ascending:true }).limit(100);
      if (eventError) throw eventError;
      const relevantEvents = (events || []).filter((row:any) => !row.target_agents?.length || row.source_agent === auth.agent || row.target_agents.includes(auth.agent));
      return json({ agent:auth.agent, generated_at:new Date().toISOString(), context:visible.slice(0,60), events:relevantEvents });
    }

    if (req.method === "POST" && path === "/context") {
      const body = await req.json().catch(() => ({}));
      const type = clean(body?.context_type, 40);
      const title = clean(body?.title, 240);
      const summary = clean(body?.summary, 4000);
      if (!CONTEXT_TYPES.has(type) || !title || !summary) return json({ error:"invalid_context" }, 400);
      const relatedAgents = safeArray(body?.related_agents);
      const { data, error } = await admin.from("ai_shared_context").insert({
        context_type:type,
        visibility:["ecosystem","restricted","agent"].includes(body?.visibility) ? body.visibility : "ecosystem",
        sensitivity:["public","internal","confidential","restricted"].includes(body?.sensitivity) ? body.sensitivity : "internal",
        source_agent:auth.agent,
        owner_agent:clean(body?.owner_agent,100) || null,
        subject_type:clean(body?.subject_type,80) || "ecosystem",
        subject_key:clean(body?.subject_key,200) || "ekodi",
        title,
        summary,
        payload:typeof body?.payload === "object" && body.payload ? body.payload : {},
        related_services:safeServices(body?.related_services),
        related_agents:relatedAgents,
        confidence:Math.min(1, Math.max(0, Number(body?.confidence ?? 1))),
        expires_at:body?.expires_at || null,
      }).select("*").single();
      if (error) throw error;
      await admin.from("ai_collaboration_events").insert({ event_type:"context_updated", source_agent:auth.agent, target_agents:relatedAgents, context_id:data.id, sensitivity:data.sensitivity, summary:title, related_services:data.related_services });
      return json({ context:data }, 201);
    }

    if (req.method === "POST" && path === "/events") {
      const body = await req.json().catch(() => ({}));
      const type = clean(body?.event_type, 40);
      const summary = clean(body?.summary, 4000);
      if (!EVENT_TYPES.has(type) || !summary) return json({ error:"invalid_event" }, 400);
      const { data, error } = await admin.from("ai_collaboration_events").insert({
        event_type:type,
        source_agent:auth.agent,
        target_agents:safeArray(body?.target_agents),
        context_id:body?.context_id || null,
        sensitivity:["public","internal","confidential","restricted"].includes(body?.sensitivity) ? body.sensitivity : "internal",
        summary,
        payload:typeof body?.payload === "object" && body.payload ? body.payload : {},
        related_services:safeServices(body?.related_services),
      }).select("*").single();
      if (error) throw error;
      return json({ event:data }, 201);
    }

    if (req.method === "POST" && path === "/cursor") {
      const body = await req.json().catch(() => ({}));
      const lastEventId = Math.max(0, Number(body?.last_event_id || 0));
      const { data, error } = await admin.from("ai_agent_cursors").upsert({ agent_key:auth.agent, last_event_id:lastEventId, updated_at:new Date().toISOString() }, { onConflict:"agent_key" }).select("*").single();
      if (error) throw error;
      return json({ cursor:data });
    }

    return json({ error:"not_found" }, 404);
  } catch (error) {
    console.error("ai-context-agent", String((error as Error)?.message || error));
    return json({ error:"agent_context_failed" }, 500);
  }
});
