import { MARKETING_AI_PROFILE } from "./profile.js";
import { runMarketingAiConformance } from "./conformance.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function developerCenter() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EKODI Developer Center</title>
<style>body{font-family:system-ui,sans-serif;max-width:880px;margin:0 auto;padding:48px 24px;line-height:1.65;color:#17202a}h1{font-size:2rem}code{background:#f3f5f7;padding:.15rem .4rem;border-radius:.35rem}.card{border:1px solid #dfe5eb;border-radius:14px;padding:20px;margin:18px 0}a{color:inherit}</style></head>
<body><p>EKODI Platform</p><h1>Developer Center</h1>
<p>개발사의 내부 구현은 자유입니다. EKODI와 맞닿는 접점만 EKODI Integration Profile을 준수하고 호환성 검증을 통과하면 됩니다.</p>
<div class="card"><h2>Marketing AI Profile v1</h2><p>공통 식별자, 서비스 경계, 필수 capability와 자동검증 기준을 정의합니다.</p><p><a href="/api/profiles/marketing-ai/v1">Machine-readable Profile 보기</a></p></div>
<div class="card"><h2>Conformance</h2><p>검사 실행 API는 EKODI가 발급한 테스트 키를 요구합니다. 공개 브라우저에서 임의의 외부 주소를 검사하도록 열어두지 않습니다.</p></div>
</body></html>`;
}

function testKeyMatches(request, env) {
  const expected = env?.EKODI_INTEGRATION_TEST_KEY;
  if (!expected) return false;
  const provided = request.headers.get("x-ekodi-integration-test-key") || "";
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return mismatch === 0;
}

async function parseJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }
  return request.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "ekodi-integration-core", version: "0.1.0", visibility: "private-core/public-gateway" });
    }

    if (request.method === "GET" && (url.pathname === "/api/profiles/marketing-ai/v1" || url.pathname === "/.well-known/ekodi-integration-profile.json")) {
      return json(MARKETING_AI_PROFILE, 200, { "cache-control": "public, max-age=300" });
    }

    if (request.method === "GET" && url.pathname === "/api/profiles") {
      return json({ profiles: [{ id: "marketing-ai", version: "1.0.0", status: "draft", href: "/api/profiles/marketing-ai/v1" }] });
    }

    if (request.method === "POST" && url.pathname === "/api/conformance/marketing-ai/v1/run") {
      if (!testKeyMatches(request, env)) {
        return json({ error: "unauthorized", message: "A valid EKODI integration test key is required." }, 401);
      }

      let payload;
      try {
        payload = await parseJson(request);
      } catch (error) {
        return json({ error: "invalid_request", message: error instanceof Error ? error.message : String(error) }, 400);
      }

      if (typeof payload?.target_origin !== "string") {
        return json({ error: "invalid_request", message: "target_origin is required." }, 400);
      }

      const report = await runMarketingAiConformance({ targetOrigin: payload.target_origin, fetchImpl: fetch });
      return json(report, report.overall === "PASS" ? 200 : 422);
    }

    if (request.method === "GET" && url.pathname === "/") {
      return html(developerCenter());
    }

    return json({ error: "not_found" }, 404);
  },
};
