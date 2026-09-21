import { MARKETING_AI_PROFILE } from "./profile.js";

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

function check(id, status, detail) {
  return { id, status, detail };
}

function isIpLiteral(hostname) {
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Like = hostname.includes(":");
  return ipv4.test(hostname) || ipv6Like;
}

export function validateTargetOrigin(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, detail: "Target must be a valid absolute URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, detail: "Only HTTPS targets are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, detail: "Credentials in target URLs are not allowed." };
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return { ok: false, detail: "Target must be an origin only, without path, query, or fragment." };
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, detail: "Local or private-style hostnames are not allowed." };
  }
  if (isIpLiteral(hostname)) {
    return { ok: false, detail: "Raw IP targets are not allowed. Use a reviewed HTTPS hostname." };
  }

  return { ok: true, origin: url.origin, detail: "Target origin passed static URL security checks." };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function missingValues(required, actual) {
  const values = new Set(safeArray(actual));
  return required.filter((value) => !values.has(value));
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "EKODI-Integration-Core/1.0" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Redirects are not allowed (${response.status}).`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHealth(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json,text/plain", "User-Agent": "EKODI-Integration-Core/1.0" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Redirects are not allowed (${response.status}).`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}

export async function runMarketingAiConformance({ targetOrigin, fetchImpl = fetch, timeoutMs = 5000 }) {
  const checks = [];
  const target = validateTargetOrigin(targetOrigin);
  checks.push(check("target_url_security", target.ok ? "PASS" : "FAIL", target.detail));

  if (!target.ok) {
    return report(targetOrigin, checks);
  }

  const profile = MARKETING_AI_PROFILE;
  const manifestUrl = new URL(profile.discovery.manifest_path, target.origin).toString();
  let manifest;
  try {
    manifest = await fetchJson(fetchImpl, manifestUrl, timeoutMs);
    checks.push(check("manifest_reachable", "PASS", "Integration manifest is reachable without redirect."));
  } catch (error) {
    checks.push(check("manifest_reachable", "FAIL", error instanceof Error ? error.message : String(error)));
    return report(target.origin, checks);
  }

  const requiredFields = profile.manifest_contract.required_fields;
  const missingFields = requiredFields.filter((field) => !(field in manifest));
  checks.push(
    check(
      "manifest_shape",
      missingFields.length === 0 ? "PASS" : "FAIL",
      missingFields.length === 0 ? "Required manifest fields are present." : `Missing fields: ${missingFields.join(", ")}`,
    ),
  );

  const profileMatches =
    manifest.schema_version === profile.manifest_contract.schema_version &&
    manifest.profile === profile.manifest_contract.profile &&
    manifest.profile_version === profile.manifest_contract.profile_version;
  checks.push(
    check(
      "profile_match",
      profileMatches ? "PASS" : "FAIL",
      profileMatches
        ? `${manifest.profile}@${manifest.profile_version} matches the EKODI profile.`
        : `Expected ${profile.profile_id}@${profile.version} with schema ${profile.manifest_contract.schema_version}.`,
    ),
  );

  const missingIdentity = missingValues(profile.manifest_contract.required_identity_context, manifest.identity_context);
  checks.push(
    check(
      "identity_context_match",
      missingIdentity.length === 0 ? "PASS" : "FAIL",
      missingIdentity.length === 0
        ? "Required EKODI canonical context identifiers are declared."
        : `Missing identity context: ${missingIdentity.join(", ")}`,
    ),
  );

  const missingCapabilities = missingValues(profile.manifest_contract.required_capabilities, manifest.capabilities);
  checks.push(
    check(
      "capabilities_match",
      missingCapabilities.length === 0 ? "PASS" : "FAIL",
      missingCapabilities.length === 0
        ? "Required Marketing AI capabilities are declared."
        : `Missing capabilities: ${missingCapabilities.join(", ")}`,
    ),
  );

  const healthPath = typeof manifest?.endpoints?.health === "string" ? manifest.endpoints.health : profile.discovery.health_path;
  if (!healthPath.startsWith("/") || healthPath.startsWith("//")) {
    checks.push(check("health_reachable", "FAIL", "Health endpoint must be a same-origin absolute path."));
    return report(target.origin, checks);
  }

  try {
    const status = await fetchHealth(fetchImpl, new URL(healthPath, target.origin).toString(), timeoutMs);
    checks.push(check("health_reachable", "PASS", `Health endpoint returned HTTP ${status}.`));
  } catch (error) {
    checks.push(check("health_reachable", "FAIL", error instanceof Error ? error.message : String(error)));
  }

  return report(target.origin, checks);
}

function report(targetOrigin, checks) {
  return {
    overall: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    profile: `${MARKETING_AI_PROFILE.profile_id}@${MARKETING_AI_PROFILE.version}`,
    target_origin: targetOrigin,
    checked_at: new Date().toISOString(),
    checks,
  };
}
