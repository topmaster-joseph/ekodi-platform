import { createGeminiPersonalProvider } from './gemini-provider-adapter.js';
import { createPersonalOpenAiProvider } from './personal-openai-provider-adapter.js';
import { createClaudePersonalProvider } from './claude-provider-adapter.js';

const API_PROVIDERS = Object.freeze([
  {
    id:'gemini-api',
    label:'Google AI Studio · Gemini',
    shortLabel:'Gemini',
    kind:'personal-api',
    connectUrl:'https://aistudio.google.com/apikey',
    help:'Google AI Studio에서 API 키를 만든 뒤 한 번 연결하면 됩니다.',
    recommended:true,
  },
  {
    id:'openai-api',
    label:'OpenAI API',
    shortLabel:'OpenAI',
    kind:'personal-api',
    connectUrl:'https://platform.openai.com/api-keys',
    help:'OpenAI Platform에서 본인 API 키를 만든 뒤 연결합니다.',
  },
  {
    id:'claude-api',
    label:'Claude API',
    shortLabel:'Claude',
    kind:'personal-api',
    connectUrl:'https://platform.claude.com/settings/keys',
    help:'Claude Console에서 API 키를 만든 뒤 연결합니다.',
  },
]);

const WEB_PROVIDERS = Object.freeze([
  { id:'gemini-web', label:'Gemini', kind:'personal-web', url:'https://gemini.google.com/' },
  { id:'chatgpt-web', label:'ChatGPT', kind:'personal-web', url:'https://chatgpt.com/' },
  { id:'claude-web', label:'Claude', kind:'personal-web', url:'https://claude.ai/' },
]);

const PROVIDER_MAP = new Map([...API_PROVIDERS, ...WEB_PROVIDERS].map(item => [item.id, item]));

export function personalAiProviders() {
  return [...API_PROVIDERS, ...WEB_PROVIDERS].map(item => ({ ...item }));
}

export function personalApiProviderIds() {
  return API_PROVIDERS.map(item => item.id);
}

export function personalWebProviderIds() {
  return WEB_PROVIDERS.map(item => item.id);
}

export function getPersonalAiProvider(providerId) {
  const item = PROVIDER_MAP.get(String(providerId || '').trim());
  return item ? { ...item } : null;
}

export function validatePersonalApiKey(providerId, apiKey) {
  const id = String(providerId || '').trim();
  const value = String(apiKey || '').trim();
  if (!API_PROVIDERS.some(item => item.id === id)) return { ok:false, code:'UNSUPPORTED_PROVIDER' };
  if (value.length < 20 || value.length > 512 || /\s/.test(value)) return { ok:false, code:'INVALID_KEY_FORMAT' };
  if (id === 'openai-api' && !/^sk-[A-Za-z0-9_-]+$/.test(value)) return { ok:false, code:'INVALID_OPENAI_KEY' };
  if (id === 'claude-api' && !/^sk-ant-[A-Za-z0-9_-]+$/.test(value)) return { ok:false, code:'INVALID_CLAUDE_KEY' };
  return { ok:true };
}

export function createPersonalProvider(providerId, options = {}) {
  const id = String(providerId || '').trim();
  if (id === 'gemini-api') return createGeminiPersonalProvider(options);
  if (id === 'openai-api') return createPersonalOpenAiProvider(options);
  if (id === 'claude-api') return createClaudePersonalProvider(options);
  return null;
}

export function firstConnectionGuide(connectedProviderIds = []) {
  const connected = new Set((Array.isArray(connectedProviderIds) ? connectedProviderIds : []).map(String));
  if (API_PROVIDERS.some(item => connected.has(item.id))) return null;
  return Object.freeze({
    title:'처음 한 번만 내 AI를 연결하세요',
    body:'가장 쉬운 방법은 Google AI Studio의 Gemini입니다. 연결하지 않아도 EKODI Core는 계속 사용할 수 있습니다.',
    steps:[
      '사용할 AI를 하나 선택합니다.',
      '해당 서비스에서 본인 API 키를 만듭니다.',
      'EKODI에 붙여넣고 연결을 누릅니다. 키는 서버에서 암호화됩니다.',
      '연결이 끝나면 이 안내는 자동으로 사라지고 이후에는 EKODI가 알아서 선택합니다.',
    ],
    recommendedProvider:'gemini-api',
  });
}

export const PERSONAL_AI_PROVIDER_REGISTRY = Object.freeze({
  version:'2026-08-23.1',
  apiProviders:API_PROVIDERS,
  webProviders:WEB_PROVIDERS,
});
