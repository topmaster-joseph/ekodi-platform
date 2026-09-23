import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const allowedOrigins = new Set(["https://ekodi.kr", "http://localhost:8788", "http://127.0.0.1:8788"]);

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const uniq = (values: unknown, max = 16) => [...new Set((Array.isArray(values) ? values : []).map(v => clip(v, 60)).filter(Boolean))].slice(0, max);
const cors = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://ekodi.kr",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ekodi-workspace",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
async function auth(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return null;
  const db = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { db, user: data.user };
}
async function workspaceContext(req: Request, userId: string) {
  const url = new URL(req.url);
  const slug = clip(req.headers.get("x-ekodi-workspace") || url.searchParams.get("workspace"), 100).toLowerCase();
  if (!slug) return { slug: "", tenantId: null, tenant: null, membership: null, member: true };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) return { error: "invalid_workspace", slug, tenantId: null, member: false };
  const { data: tenant, error: tenantError } = await admin.from("tenants").select("id,slug,name,status").eq("slug", slug).eq("status", "active").maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) return { error: "workspace_not_found", slug, tenantId: null, member: false };
  const { data: memberships, error: memberError } = await admin.from("tenant_members").select("role,status").eq("tenant_id", tenant.id).eq("user_id", userId).eq("status", "active").limit(1);
  if (memberError) throw memberError;
  const membership = Array.isArray(memberships) && memberships.length ? memberships[0] : null;
  return { slug, tenantId: tenant.id, tenant, membership, member: Boolean(membership) };
}
const normalizeMode = (v: unknown) => ["online", "offline", "hybrid"].includes(String(v)) ? String(v) : "hybrid";
const normalizeVisibility = (v: unknown) => ["public", "members", "private"].includes(String(v)) ? String(v) : "public";
const normalizeJoinPolicy = (v: unknown) => ["open", "approval", "invite"].includes(String(v)) ? String(v) : "approval";
const safeSlug = (name: string) => {
  const ascii = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 36);
  return ascii || `circle-${crypto.randomUUID().slice(0, 8)}`;
};
async function uniqueSlug(name: string) {
  const base = safeSlug(name);
  let slug = base;
  for (let i = 0; i < 8; i++) {
    const { data } = await admin.from("community_circles").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base.slice(0, 28)}-${crypto.randomUUID().slice(0, 6)}`;
  }
  return `circle-${crypto.randomUUID().slice(0, 12)}`;
}
function inferCategory(text: string) {
  const t = text.toLowerCase();
  const rules = [
    ["faith", ["성경", "기도", "신앙", "예배", "선교", "교회"]],
    ["culture", ["찬양", "음악", "영화", "사진", "독서", "책", "글쓰기"]],
    ["learning", ["스터디", "공부", "언어", "한국어", "영어", "ai", "인공지능", "코딩"]],
    ["local", ["지역", "마을", "상인", "소상공인", "봉사", "도시재생"]],
    ["global", ["유학생", "외국인", "다문화", "해외", "디아스포라"]],
    ["life", ["육아", "여행", "운동", "식사", "요리", "청년"]],
  ];
  for (const [category, words] of rules as [string, string[]][]) if (words.some(w => t.includes(w))) return category;
  return "general";
}
function smartDraft(brief: string, interests: string[] = []) {
  const clean = clip(brief, 1800);
  const category = inferCategory(clean);
  const words = clean.replace(/[^0-9A-Za-z가-힣\s]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !["모임", "하고", "싶어", "싶어요", "함께", "사람", "만들고", "관심", "있는"].includes(w));
  const tags = [...new Set([...interests, ...words])].slice(0, 8);
  let name = clean.split(/[.!?\n]/)[0].trim();
  name = name.replace(/(모임을|동아리를|그룹을)?\s*(만들고 싶어요|만들고 싶어|만들고 싶습니다)$/g, "").trim();
  if (!name || name.length > 28) name = tags.slice(0, 2).join(" · ") || "새로운 연결";
  if (!/모임|서클|클럽|스터디|식탁|팀/.test(name)) name = `${name} Circle`;
  return {
    name: name.slice(0, 60),
    summary: `${clean.slice(0, 150)}${clean.length > 150 ? "…" : ""}`,
    purpose: "공통 관심사를 가진 사람들이 부담 없이 만나 서로 배우고, 나누고, 함께 작은 행동을 시작합니다.",
    category,
    tags,
    mode: /온라인|zoom|줌/i.test(clean) ? "online" : /오프라인|식사|걷기|여행|지역/i.test(clean) ? "offline" : "hybrid",
    location_text: "",
    schedule_text: "월 1~2회, 참여자와 조율",
    capacity: 12,
    visibility: "public",
    join_policy: "approval",
    ai_mode: "smart-fallback",
  };
}
function extractOutputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const c of Array.isArray(item?.content) ? item.content : []) if (typeof c?.text === "string") parts.push(c.text);
  }
  return parts.join("\n");
}
async function generateDraft(brief: string, interests: string[]) {
  const fallback = smartDraft(brief, interests);
  if (!OPENAI_API_KEY || !OPENAI_MODEL) return fallback;
  try {
    const prompt = `Create a concise Korean community-circle draft from the user's idea. Return JSON only with keys: name, summary, purpose, category, tags, mode, location_text, schedule_text, capacity, visibility, join_policy. Allowed mode: online/offline/hybrid. Allowed visibility: public/members/private. Allowed join_policy: open/approval/invite. Do not invent specific dates, addresses, or people. User interests: ${interests.join(", ")}. Idea: ${brief}`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "authorization": `Bearer ${OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: OPENAI_MODEL, input: prompt }),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const text = extractOutputText(data);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const ai = JSON.parse(match[0]);
    return {
      name: clip(ai.name, 60) || fallback.name,
      summary: clip(ai.summary, 360) || fallback.summary,
      purpose: clip(ai.purpose, 700) || fallback.purpose,
      category: clip(ai.category, 40) || fallback.category,
      tags: uniq(ai.tags, 8).length ? uniq(ai.tags, 8) : fallback.tags,
      mode: normalizeMode(ai.mode),
      location_text: clip(ai.location_text, 160),
      schedule_text: clip(ai.schedule_text, 160) || fallback.schedule_text,
      capacity: Number.isFinite(Number(ai.capacity)) ? Math.max(2, Math.min(500, Number(ai.capacity))) : fallback.capacity,
      visibility: normalizeVisibility(ai.visibility),
      join_policy: normalizeJoinPolicy(ai.join_policy),
      ai_mode: "provider",
    };
  } catch (error) {
    console.error("community draft provider", error);
    return fallback;
  }
}
function overlap(a: string[] = [], b: string[] = []) { const bs = new Set(b.map(x => x.toLowerCase())); return a.filter(x => bs.has(x.toLowerCase())); }
function personScore(me: any, other: any) {
  const shared = overlap(me.interests, other.interests);
  const canTeachMe = overlap(other.skills_offered, me.wants_to_learn);
  const iCanTeach = overlap(me.skills_offered, other.wants_to_learn);
  const sameRegion = me.region && other.region && me.region === other.region ? 2 : 0;
  const languages = overlap(me.languages, other.languages);
  return { score: shared.length * 4 + canTeachMe.length * 3 + iCanTeach.length * 3 + sameRegion + languages.length, shared, canTeachMe, iCanTeach };
}
function circleScore(profile: any, circle: any) {
  const shared = overlap(profile.interests, circle.tags || []);
  const categoryBoost = profile.interests.some((i: string) => i.toLowerCase() === String(circle.category).toLowerCase()) ? 2 : 0;
  return { score: shared.length * 4 + categoryBoost, shared };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const session = await auth(req);
  if (!session) return json(req, { error: "unauthorized" }, 401);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/community-api/, "") || "/";
  const userId = session.user.id;
  const workspace = await workspaceContext(req, userId);
  if (workspace.error) return json(req, { error: workspace.error }, workspace.error === "workspace_not_found" ? 404 : 400);
  try {
    if (req.method === "GET" && path === "/profile") {
      const { data } = await admin.from("community_profiles").select("*").eq("user_id", userId).maybeSingle();
      return json(req, { profile: data || null, email: session.user.email || "" });
    }
    if (req.method === "POST" && path === "/profile") {
      const body = await req.json().catch(() => ({}));
      const row = {
        user_id: userId,
        display_name: clip(body.display_name || session.user.user_metadata?.full_name || session.user.email?.split("@")[0], 100),
        bio: clip(body.bio, 500),
        region: clip(body.region, 120),
        languages: uniq(body.languages, 8),
        interests: uniq(body.interests, 20),
        skills_offered: uniq(body.skills_offered, 16),
        wants_to_learn: uniq(body.wants_to_learn, 16),
        visibility: ["members", "public", "private"].includes(String(body.visibility)) ? String(body.visibility) : "members",
        discoverable: body.discoverable !== false,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from("community_profiles").upsert(row, { onConflict: "user_id" }).select("*").single();
      if (error) throw error;
      return json(req, { profile: data }, 200);
    }
    if (req.method === "POST" && path === "/circles/draft") {
      const body = await req.json().catch(() => ({}));
      const brief = clip(body.brief, 1800);
      if (brief.length < 6) return json(req, { error: "brief_too_short" }, 400);
      const { data: profile } = await admin.from("community_profiles").select("interests").eq("user_id", userId).maybeSingle();
      const draft = await generateDraft(brief, profile?.interests || []);
      return json(req, { draft });
    }
    if (req.method === "POST" && path === "/circles") {
      const body = await req.json().catch(() => ({}));
      const name = clip(body.name, 60);
      if (!name) return json(req, { error: "name_required" }, 400);
      const { data: profile } = await admin.from("community_profiles").select("user_id").eq("user_id", userId).maybeSingle();
      if (!profile) return json(req, { error: "profile_required" }, 409);
      const slug = await uniqueSlug(name);
      if (workspace.tenantId && !workspace.member) return json(req, { error: "workspace_membership_required" }, 403);
      const row = {
        owner_user_id: userId, workspace_tenant_id: workspace.tenantId, slug, name,
        summary: clip(body.summary, 360), purpose: clip(body.purpose, 700), category: clip(body.category, 40) || "general",
        tags: uniq(body.tags, 12), mode: normalizeMode(body.mode), location_text: clip(body.location_text, 160), schedule_text: clip(body.schedule_text, 160),
        capacity: body.capacity ? Math.max(2, Math.min(500, Number(body.capacity))) : null,
        visibility: normalizeVisibility(body.visibility), join_policy: normalizeJoinPolicy(body.join_policy), status: "active", updated_at: new Date().toISOString(),
      };
      const { data: circle, error } = await admin.from("community_circles").insert(row).select("*").single();
      if (error) throw error;
      await admin.from("community_circle_members").insert({ circle_id: circle.id, user_id: userId, role: "owner", status: "active", updated_at: new Date().toISOString() });
      await admin.from("community_activity").insert({ actor_user_id: userId, circle_id: circle.id, activity_type: "circle.created", body: { name: circle.name } });
      return json(req, { circle }, 201);
    }
    if (req.method === "GET" && path === "/circles") {
      const { data: profile } = await admin.from("community_profiles").select("interests,region,languages").eq("user_id", userId).maybeSingle();
      let circlesQuery = admin.from("community_circles").select("id,workspace_tenant_id,slug,name,summary,purpose,category,tags,mode,location_text,schedule_text,capacity,visibility,join_policy,status,owner_user_id,created_at").eq("status", "active").order("created_at", { ascending: false }).limit(100);
      circlesQuery = workspace.tenantId ? circlesQuery.eq("workspace_tenant_id", workspace.tenantId) : circlesQuery.is("workspace_tenant_id", null);
      circlesQuery = workspace.tenantId && !workspace.member ? circlesQuery.eq("visibility", "public") : circlesQuery.in("visibility", ["public", "members"]);
      const { data: circles, error } = await circlesQuery;
      if (error) throw error;
      const ids = (circles || []).map(c => c.id);
      const { data: memberships } = ids.length ? await admin.from("community_circle_members").select("circle_id,user_id,status,role").in("circle_id", ids) : { data: [] as any[] };
      const counts = new Map<string, number>();
      const mine = new Map<string, any>();
      for (const m of memberships || []) { if (m.status === "active") counts.set(m.circle_id, (counts.get(m.circle_id) || 0) + 1); if (m.user_id === userId) mine.set(m.circle_id, m); }
      const enriched = (circles || []).map(c => { const match = profile ? circleScore(profile, c) : { score: 0, shared: [] }; return { ...c, member_count: counts.get(c.id) || 0, my_membership: mine.get(c.id) || null, match_score: match.score, shared_interests: match.shared }; }).sort((a, b) => b.match_score - a.match_score || +new Date(b.created_at) - +new Date(a.created_at));
      return json(req, { circles: enriched });
    }
    if (req.method === "GET" && path === "/me/circles") {
      const { data: memberships, error } = await admin.from("community_circle_members").select("circle_id,role,status,created_at").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (memberships || []).map(m => m.circle_id);
      const { data: circles } = ids.length ? await admin.from("community_circles").select("id,slug,name,summary,category,tags,mode,schedule_text,status").in("id", ids) : { data: [] as any[] };
      const map = new Map((circles || []).map(c => [c.id, c]));
      return json(req, { circles: (memberships || []).map(m => ({ ...m, circle: map.get(m.circle_id) || null })) });
    }
    if (req.method === "GET" && path === "/people/recommendations") {
      const { data: me } = await admin.from("community_profiles").select("*").eq("user_id", userId).maybeSingle();
      if (!me) return json(req, { people: [] });
      const { data: people, error } = await admin.from("community_profiles").select("user_id,display_name,bio,region,languages,interests,skills_offered,wants_to_learn,visibility,discoverable,updated_at").neq("user_id", userId).eq("discoverable", true).neq("visibility", "private").limit(100);
      if (error) throw error;
      const ranked = (people || []).map(p => ({ p, m: personScore(me, p) })).filter(x => x.m.score > 0).sort((a, b) => b.m.score - a.m.score).slice(0, 18).map(({ p, m }) => ({ user_id: p.user_id, display_name: p.display_name, bio: p.bio, region: p.region, interests: p.interests, score: m.score, shared_interests: m.shared, can_help_me_with: m.canTeachMe, i_can_help_with: m.iCanTeach }));
      return json(req, { people: ranked });
    }
    const joinMatch = path.match(/^\/circles\/([0-9a-f-]+)\/join$/i);
    if (req.method === "POST" && joinMatch) {
      const circleId = joinMatch[1];
      const body = await req.json().catch(() => ({}));
      const { data: circle } = await admin.from("community_circles").select("id,workspace_tenant_id,join_policy,status,capacity").eq("id", circleId).maybeSingle();
      if (!circle || circle.status !== "active") return json(req, { error: "circle_not_available" }, 404);
      if (workspace.tenantId && circle.workspace_tenant_id !== workspace.tenantId) return json(req, { error: "circle_not_available" }, 404);
      if (circle.workspace_tenant_id && (!workspace.tenantId || !workspace.member)) return json(req, { error: "workspace_membership_required" }, 403);
      if (circle.join_policy === "invite") return json(req, { error: "invite_only" }, 403);
      if (circle.capacity) { const { count } = await admin.from("community_circle_members").select("circle_id", { count: "exact", head: true }).eq("circle_id", circleId).eq("status", "active"); if ((count || 0) >= circle.capacity) return json(req, { error: "circle_full" }, 409); }
      const status = circle.join_policy === "open" ? "active" : "pending";
      const { data: membership, error } = await admin.from("community_circle_members").upsert({ circle_id: circleId, user_id: userId, role: "member", status, note: clip(body.note, 500), updated_at: new Date().toISOString() }, { onConflict: "circle_id,user_id" }).select("circle_id,user_id,role,status,created_at,updated_at").single();
      if (error) throw error;
      await admin.from("community_activity").insert({ actor_user_id: userId, circle_id: circleId, activity_type: status === "active" ? "membership.joined" : "membership.requested", body: {} });
      return json(req, { membership }, status === "active" ? 200 : 202);
    }
    const detailMatch = path.match(/^\/circles\/([0-9a-f-]+)$/i);
    if (req.method === "GET" && detailMatch) {
      const { data: circle } = await admin.from("community_circles").select("*").eq("id", detailMatch[1]).maybeSingle();
      if (!circle || circle.status === "archived") return json(req, { error: "not_found" }, 404);
      if (workspace.tenantId && circle.workspace_tenant_id !== workspace.tenantId) return json(req, { error: "not_found" }, 404);
      if (circle.workspace_tenant_id && circle.visibility !== "public" && (!workspace.tenantId || !workspace.member)) return json(req, { error: "workspace_membership_required" }, 403);
      if (circle.visibility === "private" && circle.owner_user_id !== userId) return json(req, { error: "not_found" }, 404);
      const [{ count }, { data: mine }] = await Promise.all([
        admin.from("community_circle_members").select("circle_id", { count: "exact", head: true }).eq("circle_id", circle.id).eq("status", "active"),
        admin.from("community_circle_members").select("role,status").eq("circle_id", circle.id).eq("user_id", userId).maybeSingle(),
      ]);
      return json(req, { circle: { ...circle, member_count: count || 0, my_membership: mine || null } });
    }
    return json(req, { error: "not_found" }, 404);
  } catch (error) {
    console.error("community-api", error);
    return json(req, { error: "community_api_failed" }, 500);
  }
});
