export const SECURE_PROJECTION_POLICY = Object.freeze({
  version: '1.0.0',
  model: 'purpose-bound-minimum-disclosure',
  defaultDecision: 'deny-undocumented-field',
  secrets: 'never-project',
  sourceAndTopology: 'never-project-to-browser-or-external-ai',
  browserRule: 'do-not-send-what-the-viewer-must-not-see',
  profiles: Object.freeze([
    'experience_public',
    'user_self',
    'workspace_member',
    'admin_safe',
    'admin_diagnostic',
    'ai_minimum',
    'ai_marketing',
  ]),
});

const HARD_SECRET_KEY = /(?:^|[_-])(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer|authorization|cookie|private[_-]?key|encryption[_-]?key|credential|session)(?:$|[_-])/i;
const INTERNAL_TOPOLOGY_KEY = /(?:^|[_-])(repository|repo|branch|commit|worker|binding|queue|bucket|table|schema|endpoint|hostname|host|origin|pathname|source[_-]?path|file[_-]?path|stack|trace|sql|dsn|connection|database[_-]?url|artifact[_-]?name|checksum|account[_-]?id|zone[_-]?id|deployment[_-]?id)(?:$|[_-])/i;
const PERSONAL_DATA_KEY = /(?:^|[_-])(email|phone|mobile|telephone|address|birth|birthday|ssn|resident|passport|bank[_-]?account|account[_-]?number|card[_-]?number|person[_-]?name|full[_-]?name|customer[_-]?name|contact[_-]?name)(?:$|[_-])/i;
const SUBJECT_ID_KEY = /^(?:user|actor|tenant|workspace|space|customer|member|owner)[_-]?id$/i;

const PROFILE_RULES = Object.freeze({
  experience_public: Object.freeze({ personal: 'mask', topology: 'drop', ids: 'alias', text: 'strict' }),
  user_self: Object.freeze({ personal: 'preserve', topology: 'drop', ids: 'preserve', text: 'safe' }),
  workspace_member: Object.freeze({ personal: 'mask', topology: 'drop', ids: 'alias', text: 'safe' }),
  admin_safe: Object.freeze({ personal: 'mask', topology: 'drop', ids: 'preserve', text: 'safe' }),
  admin_diagnostic: Object.freeze({ personal: 'preserve', topology: 'drop', ids: 'preserve', text: 'safe' }),
  ai_minimum: Object.freeze({ personal: 'drop', topology: 'drop', ids: 'alias', text: 'strict' }),
  ai_marketing: Object.freeze({ personal: 'drop', topology: 'drop', ids: 'alias', text: 'strict' }),
});

export function projectionProfileForPrincipal(principal, { surface = 'workspace', elevated = false } = {}) {
  if (surface === 'experience') return 'experience_public';
  if (surface === 'ai') return 'ai_minimum';
  if (principal?.kind === 'admin') return elevated ? 'admin_diagnostic' : 'admin_safe';
  if (surface === 'self') return 'user_self';
  return 'workspace_member';
}

export function sanitizeProjectionText(value, { strict = false, max = 20_000 } = {}) {
  let text = String(value ?? '').slice(0, max);
  text = text
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*[^\s,;]{4,}/gi, '$1=[REDACTED]')
    .replace(/(?:postgres(?:ql)?|mysql|redis):\/\/[^\s]+/gi, '[REDACTED_CONNECTION]')
    .replace(/[A-Za-z]:\\(?:[^\s\\]+\\){1,}[^\s]*/g, '[REDACTED_PATH]')
    .replace(/\/(?:home|root|srv|var|etc|opt)\/(?:[^\s/]+\/)*[^\s]*/g, '[REDACTED_PATH]');
  if (strict) {
    text = text
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
      .replace(/\b(?:\+?\d[\d\s-]{7,}\d)\b/g, '[REDACTED_PHONE]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
      .replace(/https:\/\/[^\s"']*workers\.dev[^\s"']*/gi, '[REDACTED_INTERNAL_URL]');
  }
  return text;
}

export function projectValue(value, { profile = 'experience_public', purpose = 'display', maxDepth = 10 } = {}) {
  const rules = PROFILE_RULES[profile];
  if (!rules) throw new Error('SECURE_PROJECTION_UNKNOWN_PROFILE');
  return projectNode(value, { profile, rules, purpose, depth: 0, maxDepth });
}

function projectNode(value, state) {
  if (state.depth > state.maxDepth) return '[TRUNCATED_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeProjectionText(value, { strict: state.rules.text === 'strict' });
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map(item => projectNode(item, { ...state, depth: state.depth + 1 }));
  }
  if (typeof value !== 'object') return String(value);

  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isHardSecretKey(key)) continue;
    if (isInternalTopologyKey(key) && state.rules.topology === 'drop') continue;
    if (isPersonalDataKey(key)) {
      if (state.rules.personal === 'drop') continue;
      if (state.rules.personal === 'mask') {
        result[key] = maskPersonalValue(key, raw);
        continue;
      }
    }
    if (isSubjectIdKey(key) && state.rules.ids === 'alias') {
      result[key] = aliasVisibleId(raw);
      continue;
    }
    result[key] = projectNode(raw, { ...state, depth: state.depth + 1 });
  }
  return result;
}

export async function projectForExternalAi(value, { profile = 'ai_minimum', purpose = 'external-ai', salt = '' } = {}) {
  if (!['ai_minimum', 'ai_marketing'].includes(profile)) throw new Error('SECURE_PROJECTION_AI_PROFILE_REQUIRED');
  const projected = projectValue(value, { profile, purpose });
  return pseudonymizeIds(projected, String(salt || purpose));
}

export function projectionStamp(profile, purpose = 'display') {
  if (!PROFILE_RULES[profile]) throw new Error('SECURE_PROJECTION_UNKNOWN_PROFILE');
  return Object.freeze({
    policyVersion: SECURE_PROJECTION_POLICY.version,
    profile,
    purpose,
    minimumDisclosure: true,
    secretsProjected: false,
    sourceTopologyProjected: false,
  });
}

export function isHardSecretKey(key) {
  return HARD_SECRET_KEY.test(normalizeKey(key));
}

export function isInternalTopologyKey(key) {
  return INTERNAL_TOPOLOGY_KEY.test(normalizeKey(key));
}

export function isPersonalDataKey(key) {
  return PERSONAL_DATA_KEY.test(normalizeKey(key));
}

function isSubjectIdKey(key) {
  return SUBJECT_ID_KEY.test(normalizeKey(key));
}

function normalizeKey(key) {
  return String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function maskPersonalValue(key, value) {
  const normalized = normalizeKey(key);
  const text = String(value ?? '');
  if (!text) return text;
  if (normalized.includes('email')) return maskEmail(text);
  if (/(phone|mobile|telephone)/.test(normalized)) return maskPhone(text);
  if (normalized.includes('address')) return '[MASKED_ADDRESS]';
  if (/(bank_account|account_number|card_number)/.test(normalized)) return maskTail(text, 4, '[MASKED_ACCOUNT]');
  if (/(ssn|resident|passport|birth|birthday)/.test(normalized)) return '[MASKED_PERSONAL]';
  return maskName(text);
}

function maskEmail(value) {
  const [local, domain] = String(value).split('@');
  if (!domain) return '[MASKED_EMAIL]';
  const head = local ? local.slice(0, 1) : '*';
  return `${head}***@${domain}`;
}

function maskPhone(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 4) return '[MASKED_PHONE]';
  return `***-****-${digits.slice(-4)}`;
}

function maskTail(value, count, fallback) {
  const compact = String(value).replace(/\s/g, '');
  return compact.length > count ? `${fallback}:${compact.slice(-count)}` : fallback;
}

function maskName(value) {
  const chars = Array.from(String(value));
  if (chars.length <= 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(Math.min(3, chars.length - 2))}${chars[chars.length - 1]}`;
}

function aliasVisibleId(value) {
  const text = String(value ?? '');
  if (!text) return text;
  const tail = text.replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'scope';
  return `ref_${tail}`;
}

async function pseudonymizeIds(value, salt) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return Promise.all(value.map(item => pseudonymizeIds(item, salt)));
  if (typeof value !== 'object') return value;
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isSubjectIdKey(key) && raw !== null && raw !== undefined && String(raw)) {
      result[key] = await digestRef(`${salt}:${key}:${String(raw)}`);
    } else {
      result[key] = await pseudonymizeIds(raw, salt);
    }
  }
  return result;
}

async function digestRef(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest)).slice(0, 8).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `ref_${hex}`;
}
