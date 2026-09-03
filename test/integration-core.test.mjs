import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../integration-core/worker.js";
import { MARKETING_AI_PROFILE } from "../integration-core/profile.js";
import { runMarketingAiConformance, validateTargetOrigin } from "../integration-core/conformance.js";

const validManifest = {
  schema_version: "1",
  service_id: "vendor-marketing-ai",
  profile: "marketing-ai",
  profile_version: "1.0.0",
  capabilities: ["diagnosis", "planner", "content_generation", "approval", "export", "performance"],
  identity_context: ["workspace_id", "user_id", "tenant_id", "service_id"],
  endpoints: { health: "/health" },
};

test("runtime profile stays aligned with the EKODI-owned profile file", () => {
  const source = JSON.parse(readFileSync(new URL("../config/integration-profiles/marketing-ai.v1.json", import.meta.url), "utf8"));
  assert.equal(MARKETING_AI_PROFILE.profile_id, source.profile_id);
  assert.equal(MARKETING_AI_PROFILE.version, source.version);
  assert.deepEqual(MARKETING_AI_PROFILE.canonical_context, source.canonical_context);
  assert.deepEqual(MARKETING_AI_PROFILE.manifest_contract, source.manifest_contract);
});

test("rejects unsafe conformance targets", () => {
  for (const target of ["http://example.com/", "https://localhost/", "https://127.0.0.1/", "https://example.com/path"]) {
    assert.equal(validateTargetOrigin(target).ok, false, target);
  }
  assert.equal(validateTargetOrigin("https://preview.vendor.example/").ok, true);
});

test("passes a conforming Marketing AI service", async () => {
  const mockFetch = async (url) => {
    if (url.endsWith("/.well-known/ekodi-integration.json")) {
      return new Response(JSON.stringify(validManifest), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/health")) return new Response("ok", { status: 200 });
    return new Response("missing", { status: 404 });
  };

  const report = await runMarketingAiConformance({ targetOrigin: "https://preview.vendor.example/", fetchImpl: mockFetch });
  assert.equal(report.overall, "PASS");
  assert.equal(report.checks.length, 7);
});

test("fails when canonical context is missing", async () => {
  const mockFetch = async (url) => {
    if (url.endsWith("/.well-known/ekodi-integration.json")) {
      const manifest = { ...validManifest, identity_context: ["user_id"] };
      return new Response(JSON.stringify(manifest), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("ok", { status: 200 });
  };

  const report = await runMarketingAiConformance({ targetOrigin: "https://preview.vendor.example/", fetchImpl: mockFetch });
  assert.equal(report.overall, "FAIL");
  assert.equal(report.checks.find((item) => item.id === "identity_context_match")?.status, "FAIL");
});

test("conformance execution is closed when no EKODI test key is configured", async () => {
  const response = await worker.fetch(
    new Request("https://dev.ekodi.kr/api/conformance/marketing-ai/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_origin: "https://preview.vendor.example/" }),
    }),
    {},
  );
  assert.equal(response.status, 401);
});

test("public profile endpoint remains readable", async () => {
  const response = await worker.fetch(new Request("https://dev.ekodi.kr/api/profiles/marketing-ai/v1"), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.profile_id, "marketing-ai");
  assert.equal(body.owner, "EKODI Integration Core");
});

test("admin projection is closed without an authenticated EKODI identity", async () => {
  const response = await worker.fetch(new Request("https://admin.ekodi.kr/dev"), {});
  assert.equal(response.status, 401);
});

test("admin projection is available to an authenticated EKODI identity", async () => {
  const response = await worker.fetch(
    new Request("https://admin.ekodi.kr/dev", {
      headers: { "cf-access-authenticated-user-email": "admin@example.invalid" },
    }),
    {},
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Developer & Integration Admin/);
});

test("admin status endpoint reports EKODI governance ownership", async () => {
  const response = await worker.fetch(
    new Request("https://admin.ekodi.kr/dev/api/status", {
      headers: { "cf-access-authenticated-user-email": "admin@example.invalid" },
    }),
    {},
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.governance_owner, "EKODI");
  assert.equal(body.production_promotion, "EKODI_APPROVAL_REQUIRED");
});
