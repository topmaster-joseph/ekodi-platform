import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const EKODI_SESSION_URL = Deno.env.get("EKODI_ADMIN_SESSION_URL") || "https://api.ekodi.kr/api/session";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BODY_KEYS = [
  "title", "summary", "text", "date", "occurred_on", "start_at", "end_at",
  "participant_count", "attendance", "location", "prayer", "prayer_request",
  "result", "note", "public_summary"
];

const clip = (value: unknown, max = 800) => String(value ?? "").trim().slice(0, max);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  },
});

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function safeBody(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const key of BODY_KEYS) {
    const value = source[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else out[key] = clip(value, key.includes("prayer") || key === "text" || key === "summary" ? 1200 : 500);
  }
  return out;
}

async function verifyEkodiAdmin(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(EKODI_SESSION_URL, {
    headers: { authorization, accept: "application/json", "user-agent": "EKODI-Community-Report-Source/1.0" },
    redirect: "error",
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.email ? { email: clip(data.email, 320) } : null;
}

function activityLabel(type: string) {
  const labels: Record<string, string> = {
    "circle.created": "모임 생성",
    "circle.updated": "모임 변경",
    "membership.joined": "모임 참여",
    "membership.requested": "참여 신청",
    "post.created": "게시물",
    "ministry.post": "사역 기록",
    "prayer.created": "기도제목",
    "ministry.prayer": "기도제목",
    "event.created": "행사 계획",
    "event.completed": "행사 완료",
    "ministry.event": "행사 기록",
    "ministry.note": "사역 메모",
  };
  return labels[type] || type;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const session = await verifyEkodiAdmin(req);
  if (!session) return json({ error: "admin_auth_required" }, 401);

  const url = new URL(req.url);
  const from = clip(url.searchParams.get("from"), 10);
  const to = clip(url.searchParams.get("to"), 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return json({ error: "invalid_report_period" }, 400);
  const until = nextDay(to);

  try {
    const [activityResult, circleResult, memberResult, profileCountResult] = await Promise.all([
      admin.from("community_activity")
        .select("id,circle_id,activity_type,body,created_at")
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lt("created_at", `${until}T00:00:00.000Z`)
        .order("created_at", { ascending: true })
        .limit(300),
      admin.from("community_circles")
        .select("id,slug,name,summary,purpose,category,tags,mode,location_text,schedule_text,status,created_at,updated_at")
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(120),
      admin.from("community_circle_members")
        .select("circle_id,role,status,created_at")
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lt("created_at", `${until}T00:00:00.000Z`)
        .order("created_at", { ascending: true })
        .limit(500),
      admin.from("community_profiles")
        .select("user_id", { count: "exact", head: true })
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lt("created_at", `${until}T00:00:00.000Z`),
    ]);

    for (const result of [activityResult, circleResult, memberResult, profileCountResult]) {
      if (result.error) throw result.error;
    }

    const circles = circleResult.data || [];
    const circleMap = new Map(circles.map((circle: any) => [circle.id, circle]));
    const windowCircles = circles.filter((circle: any) => {
      const created = String(circle.created_at || "").slice(0, 10);
      const updated = String(circle.updated_at || "").slice(0, 10);
      return (created >= from && created <= to) || (updated >= from && updated <= to);
    });

    const activities = (activityResult.data || []).map((row: any) => {
      const circle = circleMap.get(row.circle_id) as any;
      return {
        kind: "activity",
        sourceId: `activity:${row.id}`,
        date: String(row.created_at || "").slice(0, 10),
        type: clip(row.activity_type, 80),
        label: activityLabel(clip(row.activity_type, 80)),
        circle: clip(circle?.name, 160),
        body: safeBody(row.body),
      };
    });

    const circleItems = windowCircles.map((circle: any) => ({
      kind: "circle",
      sourceId: `circle:${circle.id}`,
      date: String(circle.updated_at || circle.created_at || "").slice(0, 10),
      type: String(circle.created_at || "").slice(0, 10) >= from ? "circle.created_or_active" : "circle.updated",
      label: "커뮤니티 모임",
      title: clip(circle.name, 160),
      summary: clip(circle.summary || circle.purpose, 1000),
      category: clip(circle.category, 80),
      mode: clip(circle.mode, 40),
      schedule: clip(circle.schedule_text, 320),
      location: clip(circle.location_text, 320),
      tags: Array.isArray(circle.tags) ? circle.tags.map((v: unknown) => clip(v, 60)).filter(Boolean).slice(0, 12) : [],
    }));

    const memberRows = memberResult.data || [];
    const membershipCounts = memberRows.reduce((acc: Record<string, number>, row: any) => {
      const key = clip(row.status || "unknown", 40);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const activityTypeCounts = activities.reduce((acc: Record<string, number>, item: any) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});

    const items = [...activities, ...circleItems]
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 360);

    return json({
      period: { from, to },
      generatedAt: new Date().toISOString(),
      source: "ekodi-community-supabase",
      counts: {
        items: items.length,
        activities: activities.length,
        circlesTouched: windowCircles.length,
        memberships: memberRows.length,
        newProfiles: Number(profileCountResult.count || 0),
        activeCircles: circles.filter((circle: any) => circle.status === "active").length,
      },
      activityTypeCounts,
      membershipCounts,
      ongoingCircles: circles.filter((circle: any) => circle.status === "active").slice(0, 40).map((circle: any) => ({
        title: clip(circle.name, 160),
        schedule: clip(circle.schedule_text, 320),
        category: clip(circle.category, 80),
      })),
      items,
      privacy: {
        userIdsIncluded: false,
        memberNamesIncluded: false,
        rawProfilesIncluded: false,
      },
      requestedBy: session.email,
    });
  } catch (error) {
    console.error("community-report-source", error);
    return json({ error: "community_source_failed" }, 500);
  }
});
