import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

const registry = await readJson('config/ecosystem-services.json');
const dna = await readJson('config/user-ui-dna.json');
const shell = await readJson('config/user-ui-shell.json');
const messageUI = await readJson('config/message-ui.json');

const errors = [];
const services = dna.services ?? {};
const aliases = dna.aliases ?? {};

if (!Array.isArray(dna.shared?.mustKeep) || dna.shared.mustKeep.length < 4) {
  errors.push('UI DNA shared.mustKeep must define the common EKODI family traits.');
}
if (!Array.isArray(dna.shared?.mustVary) || dna.shared.mustVary.length < 5) {
  errors.push('UI DNA shared.mustVary must define the visual dimensions that services vary.');
}

for (const service of registry.services ?? []) {
  if (service.homepage !== true) continue;
  if (!services[service.id] && !aliases[service.id]) {
    errors.push(`Public service "${service.id}" has no UI DNA family or alias.`);
  }
}

const familyOwners = new Map();
for (const [id, profile] of Object.entries(services)) {
  const required = ['family', 'mood', 'palette', 'type', 'geometry', 'density'];
  for (const key of required) {
    if (!profile?.[key]) errors.push(`UI DNA service "${id}" is missing "${key}".`);
  }
  if (profile?.family) {
    const prior = familyOwners.get(profile.family);
    if (prior) errors.push(`UI family "${profile.family}" is duplicated by "${prior}" and "${id}". Use an alias for intentional reuse.`);
    familyOwners.set(profile.family, id);
  }
}

for (const [id, alias] of Object.entries(aliases)) {
  if (!alias?.target || !services[alias.target]) {
    errors.push(`UI DNA alias "${id}" points to missing target "${alias?.target ?? ''}".`);
  }
}

if (shell?.name !== 'EKODI User UI Shell') errors.push('User UI Shell policy must use the canonical name.');
if (shell?.parentPolicy !== 'config/user-ui-dna.json') errors.push('User UI Shell must explicitly inherit the User UI DNA policy.');
if (shell?.adminExcluded !== true) errors.push('Admin UI must remain outside the User UI Shell contract.');
if (!Array.isArray(shell?.scope) || !['public', 'workspace'].every(surface => shell.scope.includes(surface))) {
  errors.push('User UI Shell must cover public and workspace user surfaces.');
}
if (shell?.principles?.singleSource !== true || shell?.principles?.noDuplicatedHeaderOrFooter !== true) {
  errors.push('User UI Shell must enforce single-source chrome without duplicate headers or footers.');
}
if (shell?.header?.strategy !== 'adopt-existing-first' || shell?.header?.owner !== 'shared-shell') {
  errors.push('User header must be shared-shell owned and adopt existing service headers first.');
}
for (const meaning of ['EKODI identity', 'current service context', 'account or My EKODI path']) {
  if (!shell?.header?.requiredMeaning?.includes(meaning)) errors.push(`User header is missing required meaning: ${meaning}`);
}
if (shell?.footer?.strategy !== 'shell-supplied' || shell?.footer?.owner !== 'shared-shell') {
  errors.push('User footer must be supplied by the shared Shell.');
}
if (shell?.footer?.legalLinks?.privacy !== 'https://ekodi.kr/privacy' || shell?.footer?.legalLinks?.terms !== 'https://ekodi.kr/terms') {
  errors.push('User footer legal links must use the canonical EKODI public policies.');
}
if (shell?.footer?.operator?.businessRegistrationNumber !== '213-13-01959') {
  errors.push('User footer operator registration number must match the public EKODI operator record.');
}
if (shell?.footer?.serviceExtension !== 'append-only' || shell?.footer?.separatePolicyPrecedence !== true) {
  errors.push('Service-specific footer information must extend, not replace, the shared platform footer.');
}

const requiredMessageTypes = ['success', 'info', 'warning', 'error', 'permission', 'security', 'system', 'waiting'];
if (messageUI?.name !== 'EKODI Message UI') errors.push('Message UI policy must be named "EKODI Message UI".');
if (!Array.isArray(messageUI?.scope) || !['user', 'admin'].every(scope => messageUI.scope.includes(scope))) {
  errors.push('Message UI policy must cover both user and admin surfaces.');
}
if (messageUI?.principles?.composition !== 'illustration + short title + optional one-line description') {
  errors.push('Message UI must preserve the shared illustration + concise copy composition.');
}
if (messageUI?.principles?.hideTechnicalDetailsByDefault !== true) {
  errors.push('Message UI must hide technical details by default.');
}
for (const type of requiredMessageTypes) {
  const profile = messageUI?.types?.[type];
  if (!profile?.label || !profile?.defaultTitle || !profile?.defaultDescription) {
    errors.push(`Message UI type "${type}" is incomplete.`);
  }
}
if (!messageUI?.technicalDetailPolicy?.neverExpose?.includes('token') || !messageUI?.technicalDetailPolicy?.neverExpose?.includes('secret')) {
  errors.push('Message UI technical detail policy must explicitly block secrets and tokens.');
}

if (errors.length) {
  console.error('EKODI user-site UI DNA validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`EKODI UI DNA OK: ${Object.keys(services).length} distinct families, ${Object.keys(aliases).length} alias(es), shared User UI Shell contract valid, all current public services covered, shared message UI policy valid.`);
