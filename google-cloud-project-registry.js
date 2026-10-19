// EKODI Google Cloud project inventory: configuration discovery is NOT provider-side verification.
// This is server-only metadata for an authenticated platform administrator. No Google keys,
// OAuth tokens, service-account JSON, billing amounts or IAM decisions may be returned here.
const PROJECT_ID = /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{6,20})$/;
const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const SERVICES = Object.freeze([
  Object.freeze({ id: 'generativelanguage.googleapis.com', name: 'Gemini Developer API' }),
  Object.freeze({ id: 'youtube.googleapis.com', name: 'YouTube Data API v3' }),
  Object.freeze({ id: 'drive.googleapis.com', name: 'Google Drive API' }),
  Object.freeze({ id: 'sheets.googleapis.com', name: 'Google Sheets API' }),
  Object.freeze({ id: 'docs.googleapis.com', name: 'Google Docs API' }),
  Object.freeze({ id: 'slides.googleapis.com', name: 'Google Slides API' }),
  Object.freeze({ id: 'translate.googleapis.com', name: 'Cloud Translation API' }),
]);
const trim = value => String(value ?? '').trim();

function configuredProjects(env = {}) {
  const entries = new Map();
  const add = (raw, source) => {
    const id = trim(raw);
    if (!PROJECT_ID.test(id)) return;
    if (!entries.has(id)) entries.set(id, { id, sources: new Set() });
    entries.get(id).sources.add(source);
  };
  for (const binding of ['GOOGLE_CLOUD_PROJECT_ID', 'GCP_PROJECT_ID', 'GEMINI_PROJECT_ID',
    'GEMINI_PROJECT_ID_2', 'GEMINI_PROJECT_ID_3', 'GEMINI_PROJECT_ID_4', 'GEMINI_PROJECT_ID_5']) {
    add(env[binding], binding);
  }
  try {
    const raw = JSON.parse(trim(env.GOOGLE_CLOUD_PROJECTS_JSON) || '[]');
    if (Array.isArray(raw)) {
      for (const item of raw.slice(0, 30)) {
        if (typeof item === 'string') add(item, 'GOOGLE_CLOUD_PROJECTS_JSON');
        else if (item && typeof item === 'object') add(item.projectId, 'GOOGLE_CLOUD_PROJECTS_JSON');
      }
    }
  } catch { /* untrusted/malformed configuration is ignored, never executed */ }
  return [...entries.values()];
}

function projectLinks(id) {
  const project = encodeURIComponent(id);
  return Object.freeze({
    overview: `https://console.cloud.google.com/home/dashboard?project=${project}`,
    apiLibrary: `https://console.cloud.google.com/apis/library?project=${project}`,
    apiCredentials: `https://console.cloud.google.com/apis/credentials?project=${project}`,
    quotas: `https://console.cloud.google.com/apis/dashboard?project=${project}`,
    billing: `https://console.cloud.google.com/billing/linkedaccount?project=${project}`,
    geminiKeys: 'https://aistudio.google.com/api-keys',
    geminiUsage: 'https://aistudio.google.com/usage',
  });
}

export function isGeminiFreeTierConfirmed(env = {}) {
  // Administrative attestation ONLY. It cannot independently prove the live
  // Google billing tier, and it must never be represented as provider telemetry.
  return TRUTHY.has(trim(env.EKODI_GEMINI_FREE_TIER_ONLY_CONFIRMED).toLowerCase());
}

export function getGoogleCloudProjectInventory(env = {}) {
  const projects = configuredProjects(env).map(({ id, sources }) => Object.freeze({
    id,
    sources: Object.freeze([...sources]),
    // Env variables prove a declared project identifier only, not API enablement,
    // Google IAM ownership, credential validity, free-tier eligibility or billing.
    discovery: 'configured-only',
    billingTier: 'unverified',
    spendCap: 'unverified',
    quota: 'unverified',
    links: projectLinks(id),
    services: Object.freeze(SERVICES.map(({ id: serviceId, name }) => Object.freeze({
      id: serviceId,
      name,
      status: 'unverified',
      settingsUrl: `https://console.cloud.google.com/apis/library/${serviceId}?project=${encodeURIComponent(id)}`,
    }))),
  }));
  return Object.freeze({
    contract: 'ekodi.google-cloud-projects.v1',
    verification: 'configuration-only',
    projectCount: projects.length,
    projects: Object.freeze(projects),
    geminiKeyPresent: Boolean(trim(env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY)),
    geminiFreeTierAttested: isGeminiFreeTierConfirmed(env),
    paidAutoEscalation: false,
    warning: '프로젝트 ID 등록은 Google API 활성화·결제 등급·무료 한도 검증이 아닙니다. Google 콘솔에서 직접 확인해야 합니다.',
    docs: 'https://ai.google.dev/gemini-api/docs/billing',
  });
}
