import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const contractPath = fileURLToPath(new URL('../config/user-surface-contract.json', import.meta.url));
let cachedContract = null;

export async function loadUserSurfaceContract() {
  if (cachedContract) return cachedContract;
  const parsed = JSON.parse(await readFile(contractPath, 'utf8'));
  if (!parsed || parsed.version !== '1.0.0') throw new Error('Unsupported EKODI user surface contract');
  if (!parsed.publicServiceOverrides || !parsed.registeredEngineBoundaries) throw new Error('Incomplete EKODI user surface contract');
  cachedContract = Object.freeze(parsed);
  return cachedContract;
}

export function applyUserSurfaceOverride(service, contract) {
  const id = String(service?.id || '').trim().toLowerCase();
  const override = contract?.publicServiceOverrides?.[id];
  if (!override) return { ...service };
  return {
    ...service,
    ...(override.url ? { url: override.url } : {}),
    ...(override.label ? { label: override.label } : {}),
    ...(override.name ? { name: override.name } : {}),
    ...(override.nameEn ? { nameEn: override.nameEn } : {}),
    ...(override.engineHost ? { engineHost: override.engineHost } : {}),
  };
}

export function assertUserFacingCanonical(service, contract) {
  const id = String(service?.id || '').trim().toLowerCase();
  const url = new URL(String(service?.url || ''));
  const host = url.hostname.toLowerCase();
  const engines = new Set(Object.values(contract.registeredEngineBoundaries).map(item => String(item.host || '').toLowerCase()));
  if (engines.has(host)) throw new Error(`Engine host cannot be a public user entry: ${id} -> ${host}`);
  if (host.endsWith('.ai.ekodi.kr')) throw new Error(`Customer-specific AI subdomain cannot be canonical: ${id} -> ${host}`);
  if (host === 'ekodi.kr' && url.pathname === '/') throw new Error(`User service must not collapse to EKODI root: ${id}`);
  return true;
}

export function assertEngineBoundarySeparation(contract) {
  const marketing = contract.registeredEngineBoundaries?.marketing;
  const ai = contract.registeredEngineBoundaries?.ai;
  if (marketing?.host !== 'marketing.ekodi.kr' || marketing?.publicUserEntry !== false) {
    throw new Error('marketing.ekodi.kr must remain a non-user-facing common engine boundary');
  }
  if (ai?.host !== 'ai.ekodi.kr' || ai?.publicUserEntry !== false || ai?.providerIndependent !== true) {
    throw new Error('ai.ekodi.kr must remain a provider-independent core engine boundary');
  }
  if (marketing.upstream !== ai.host) throw new Error('Marketing Core must consume the canonical AI Gateway boundary');
  return true;
}
