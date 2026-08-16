import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("ADMIN_STRATEGY_OPENAI_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
const CONTROL_API = "https://api.ekodi.kr";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const ALLOWED_ORIGINS = new Set(["https://admin.ekodi.kr", "https://ekodi.kr"]);
const CLASSIFICATIONS = new Set(["INFO", "REPORT", "WARNING", "INCIDENT", "DECISION"]);
const REPORT_TYPES = new Set(["REPORT", "WARNING", "INCIDENT", "DECISION", "STRATEGY"]);
const MAX_MESSAGE = 6000;

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://admin.ekodi.kr",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}
function json(req: Request, body: unknown, status = 200) {
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
function clean(value: unknown, max = MAX_MESSAGE) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}
function normalizeEmail(value: unknown) {
  return clean(value, 320).toLowerCase();
}
function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) if (typeof content?.text === "string") parts.push(content.text);
  }
  return parts.join("\n").trim();
}
function stripCodeFence(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function safeClassification(value: unknown) {
  const next = clean(value, 20).toUpperCase();
  return CLASSIFICATIONS.has(next) ? next : "INFO";
}
function safeCouncil(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((item: any) => ({
    agent: clean(item?.agent || item?.name || "Specialist AI", 80),
    conclusion: clean(item?.conclusion || item?.summary || "", 700),
  })).filter((item: any) => item.conclusion);
}
function safeServices(value: unknown) {
  if (!Array.isArray(value)) return [];
  const domains = value.map(item => clean(item, 160).toLowerCase()).filter(item => /^[a-z0-9.-]+\.ekodi\.kr$/.test(item) || item === "ekodi.kr");
  return [...new Set(domains)].slice(0, 12);
}

async function verifyAdmin(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  try {
    const response = await fetch(`${CONTROL_API}/api/session`, {
      headers: { authorization, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const email = normalizeEmail(data?.email);
    return email ? { email, authorization } : null;
  } catch {
    return null;
  }
}

async function controlOverview(authorization: string) {
  try {
    const response = await fetch(`${CONTROL_API}/api/control/overview`, {
      headers: { authorization, accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return { available: false, error: `control_${response.status}` };
    const data = await response.json().catch(() => ({}));
    const services = Array.isArray(data?.services) ? data.services.map((service: any) => ({
      name: clean(service?.name, 100),
      domain: clean(service?.domain, 160),
      state: clean(service?.state, 40),
      status: clean(service?.latest?.status || "pending", 40),
      http: service?.latest?.httpStatus ?? null,
      response_ms: service?.latest?.responseTime ?? null,
      availability_24h: service?.stats24h?.availabilityPercent ?? null,
    })) : [];
    return {
      available: true,
      generated_at: data?.generatedAt || null,
      summary: data?.summary || {},
      states: data?.states || {},
      services,
    };
  } catch {
    return { available: false, error: "control_unavailable" };
  }
}

function selectSpecialists(message: string) {
  const text = message.toLowerCase();
  const selected = new Set(["Chief AI", "Platform AI"]);
  if (/(인증|로그인|권한|보안|개인정보|privacy|security|token|토큰)/i.test(text)) selected.add("Security & Privacy AI");
  if (/(배포|릴리즈|롤백|ci|staging|운영전환|장애|느려|성능)/i.test(text)) selected.add("Release AI");
  if (/(결제|가격|요금|회계|수익|비용|정산|보험|finance)/i.test(text)) selected.add("Finance AI");
  if (/(마케팅|crm|고객|캠페인|홍보)/i.test(text)) selected.add("Marketing AI");
  if (/(교회|예배|목회|설교|성경|사역)/i.test(text)) selected.add("Ministry AI");
  if (/(커뮤니티|공동체|그룹|모임|회원)/i.test(text)) selected.add("Community AI");
  if (/(무역|거래|견적|수출|수입|계약)/i.test(text)) selected.add("Commerce & Trading AI");
  if (/(책|출판|저자|원고|author|books)/i.test(text)) selected.add("Books & Author AI");
  if (/(보험|청구|보장)/i.test(text)) selected.add("Insurance AI");
  return [...selected].slice(0, 6);
}

function systemInstruction(specialists: string[]) {
  return `당신은 EKODI 관리자 내부의 Chief AI Orchestrator다. 사람을 대신하는 절대권자가 아니라 제한된 권한 안에서 전문 AI를 조정하는 청지기적 총괄 AI다.

최우선 순서: 사명과 인간의 존엄/자유 → 안전·법·개인정보 → 동의와 사용자 주도권 → 공동체·희년 영향 → 운영 안정성 → 효율·수익.

반드시 지킬 규칙:
- 확인된 운영정보, 추론, 제안을 구분한다. 없는 사실을 만들지 않는다.
- 전문 AI의 이견과 불확실성을 숨기지 않는다.
- 가격/결제정책, 관리자·개인정보 권한, 파괴적·대량 데이터 변경, 계약·법적 책임, 고액 재정약정, 고용징계, 도메인 소유권 이전/서비스 종료, 목회적 개인판단, 권리축소 정책은 DECISION으로 분류하고 실행을 주장하지 않는다.
- 기만·강압·비밀 프로파일링·의도적 종속 유도는 금지한다.
- 이 API는 전략회의용이다. 실제 시스템 변경을 실행했다고 거짓말하지 않는다. 실행 요청은 안전한 다음 단계와 승인 필요 여부를 말한다.
- 장애/성능 문제에서는 Availability → Performance → Core Journey → Stability → New Features 순으로 판단한다.
- 답은 한국어로 간결하고 의사결정 중심으로 작성한다.

이번 회의에 우선 참여할 전문 AI: ${specialists.join(", ")}.

오직 다음 JSON 객체 하나만 출력한다. 마크다운 코드블록을 쓰지 않는다:
{
  "classification":"INFO|REPORT|WARNING|INCIDENT|DECISION",
  "title":"짧은 회의 제목",
  "answer":"대표에게 보여줄 최종 답변",
  "council":[{"agent":"전문 AI명","conclusion":"핵심 판단"}],
  "decision_required":false,
  "related_services":["example.ekodi.kr"],
  "followups":["다음 행동"]
}`;
}

async function modelReply(message: string, history: any[], overview: any) {
  if (!OPENAI_API_KEY) throw new Error("ai_provider_not_configured");
  const specialists = selectSpecialists(message);
  const historyText = history.slice(-12).map(item => `${item.role === "user" ? "관리자" : "Chief AI"}: ${clean(item.content, 2200)}`).join("\n\n");
  const operational = JSON.stringify(overview).slice(0, 18000);
  const input = `현재 시각: ${new Date().toISOString()}\n\n[검증 가능한 운영 컨텍스트]\n${operational}\n\n[최근 전략회의]\n${historyText || "이전 대화 없음"}\n\n[관리자 발언]\n${message}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      instructions: systemInstruction(specialists),
      input,
      max_output_tokens: 1800,
    }),
    signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("admin-strategy-api provider", response.status, payload?.error?.type || "unknown");
    throw new Error("ai_provider_failed");
  }
  const raw = outputText(payload);
  if (!raw) throw new Error("empty_ai_response");
  let parsed: any = {};
  try { parsed = JSON.parse(stripCodeFence(raw)); }
  catch { parsed = { classification: "INFO", title: "Chief AI 전략회의", answer: raw, council: [], decision_required: false, related_services: [], followups: [] }; }
  const classification = safeClassification(parsed?.classification);
  const decisionRequired = Boolean(parsed?.decision_required) || classification === "DECISION";
  return {
    classification: decisionRequired ? "DECISION" : classification,
    title: clean(parsed?.title || "Chief AI 전략회의", 160),
    answer: clean(parsed?.answer || raw, 10000),
    council: safeCouncil(parsed?.council),
    decision_required: decisionRequired,
    related_services: safeServices(parsed?.related_services),
    followups: Array.isArray(parsed?.followups) ? parsed.followups.slice(0, 5).map((item: unknown) => clean(item, 500)).filter(Boolean) : [],
    model: String(payload?.model || OPENAI_MODEL),
    provider_request_id: clean(payload?.id, 160) || null,
  };
}

async function ownedThread(threadId: string, email: string) {
  const { data, error } = await admin.from("admin_strategy_threads").select("id,title,status,created_at,updated_at").eq("id", threadId).eq("admin_email", email).maybeSingle();
  if (error) throw error;
  return data;
}
async function createThread(email: string, title = "새 전략회의") {
  const { data, error } = await admin.from("admin_strategy_threads").insert({ admin_email: email, title: clean(title, 160) || "새 전략회의" }).select("id,title,status,created_at,updated_at").single();
  if (error) throw error;
  return data;
}
async function threadHistory(threadId: string, email: string, limit = 40) {
  const { data, error } = await admin.from("admin_strategy_messages").select("id,role,classification,content,council,metadata,created_at").eq("thread_id", threadId).eq("admin_email", email).order("created_at", { ascending: true }).limit(limit);
  if (error) throw error;
  return data || [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const verified = await verifyAdmin(req);
  if (!verified) return json(req, { error: "admin_unauthorized" }, 401);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/admin-strategy-api/, "") || "/";
  const { email, authorization } = verified;

  try {
    if (req.method === "GET" && path === "/threads") {
      const { data, error } = await admin.from("admin_strategy_threads").select("id,title,status,created_at,updated_at").eq("admin_email", email).order("updated_at", { ascending: false }).limit(30);
      if (error) throw error;
      return json(req, { threads: data || [] });
    }

    if (req.method === "POST" && path === "/threads") {
      const body = await req.json().catch(() => ({}));
      return json(req, { thread: await createThread(email, body?.title) }, 201);
    }

    const messagesMatch = path.match(/^\/threads\/([0-9a-f-]{36})\/messages$/i);
    if (req.method === "GET" && messagesMatch) {
      const thread = await ownedThread(messagesMatch[1], email);
      if (!thread) return json(req, { error: "thread_not_found" }, 404);
      return json(req, { thread, messages: await threadHistory(thread.id, email, 100) });
    }

    if (req.method === "GET" && path === "/reports") {
      const rawLimit = Number(url.searchParams.get("limit") || 80);
      const limit = Math.min(150, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 80));
      const { data, error } = await admin.from("ai_reports").select("id,report_type,status,title,summary,details,decision_required,related_services,source,thread_id,message_id,created_at,resolved_at").eq("admin_email", email).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json(req, { reports: data || [] });
    }

    if (req.method === "POST" && path === "/chat") {
      const body = await req.json().catch(() => ({}));
      const message = clean(body?.message);
      if (!message) return json(req, { error: "message_required" }, 400);
      let thread: any = null;
      const requestedThread = clean(body?.thread_id, 80);
      if (requestedThread) thread = await ownedThread(requestedThread, email);
      if (!thread) thread = await createThread(email, clean(message, 60));

      const { data: userRow, error: userError } = await admin.from("admin_strategy_messages").insert({
        thread_id: thread.id,
        admin_email: email,
        role: "user",
        classification: "INFO",
        content: message,
        metadata: { source: "admin-strategy-room" },
      }).select("id").single();
      if (userError) throw userError;

      const history = await threadHistory(thread.id, email, 30);
      const overview = await controlOverview(authorization);
      let reply: any;
      try {
        reply = await modelReply(message, history, overview);
      } catch (error) {
        const reason = String((error as Error)?.message || error);
        if (reason === "ai_provider_not_configured") {
          reply = {
            classification: "WARNING",
            title: "Chief AI 모델 연결 확인 필요",
            answer: "전략회의 기록과 운영 컨텍스트 연결은 정상입니다. 다만 서버의 전용 AI provider 설정이 확인되지 않아 생성형 Chief AI 응답은 실행하지 않았습니다. 브라우저에는 비밀키가 노출되지 않았습니다.",
            council: [{ agent: "Platform AI", conclusion: "관리자 인증과 회의 저장 경로는 유지하고 provider 설정만 별도로 확인해야 합니다." }],
            decision_required: false,
            related_services: ["admin.ekodi.kr"],
            followups: ["서버 AI provider secret 상태 확인"],
            model: null,
            provider_request_id: null,
          };
        } else throw error;
      }

      const { data: assistantRow, error: assistantError } = await admin.from("admin_strategy_messages").insert({
        thread_id: thread.id,
        admin_email: email,
        role: "assistant",
        classification: reply.classification,
        content: reply.answer,
        council: reply.council,
        metadata: {
          title: reply.title,
          decision_required: reply.decision_required,
          related_services: reply.related_services,
          followups: reply.followups,
          model: reply.model,
          provider_request_id: reply.provider_request_id,
          overview_generated_at: overview?.generated_at || null,
          overview_available: Boolean(overview?.available),
        },
      }).select("id,created_at").single();
      if (assistantError) throw assistantError;

      await admin.from("admin_strategy_threads").update({
        title: thread.title === "새 전략회의" ? reply.title : thread.title,
        updated_at: new Date().toISOString(),
      }).eq("id", thread.id).eq("admin_email", email);

      let report: any = null;
      if (reply.classification !== "INFO" || reply.decision_required) {
        const reportType = REPORT_TYPES.has(reply.classification) ? reply.classification : "STRATEGY";
        const { data, error } = await admin.from("ai_reports").insert({
          admin_email: email,
          report_type: reportType,
          status: "open",
          title: reply.title,
          summary: clean(reply.answer, 1200),
          details: reply.answer,
          decision_required: reply.decision_required,
          related_services: reply.related_services,
          source: "strategy-room",
          thread_id: thread.id,
          message_id: assistantRow.id,
        }).select("id,report_type,status,title,decision_required,created_at").single();
        if (error) throw error;
        report = data;
      }

      return json(req, {
        thread: { ...thread, title: thread.title === "새 전략회의" ? reply.title : thread.title },
        message: {
          id: assistantRow.id,
          role: "assistant",
          classification: reply.classification,
          content: reply.answer,
          council: reply.council,
          metadata: {
            title: reply.title,
            decision_required: reply.decision_required,
            related_services: reply.related_services,
            followups: reply.followups,
          },
          created_at: assistantRow.created_at,
        },
        report,
        operation_context: {
          available: Boolean(overview?.available),
          generated_at: overview?.generated_at || null,
          summary: overview?.summary || null,
        },
        request_id: userRow.id,
      });
    }

    return json(req, { error: "not_found" }, 404);
  } catch (error) {
    console.error("admin-strategy-api", error);
    return json(req, { error: "admin_strategy_failed" }, 500);
  }
});