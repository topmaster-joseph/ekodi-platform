import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (!source.includes(before)) throw new Error(`${path}: expected source contract not found`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`${path}: no change applied`);
  await writeFile(path, next);
}

await replaceExact(
  'compact-control-center.js',
  "{ key: 'community', label: '선교회', name: '에코디커뮤니티', domain: 'community.ekodi.kr', section: 'services', icon: 'E' },",
  "{ key: 'community', label: '커뮤니티', name: '에코디커뮤니티', domain: 'community.ekodi.kr', section: 'services', icon: 'E' },"
);

const apiPath = 'api-worker.js';
let api = await readFile(apiPath, 'utf8');
const missionLine = "  { id: 'mission', name: '에코디선교회', domain: 'mission.ekodi.kr', url: 'https://mission.ekodi.kr', group: 'ministry', defaultState: 'planned', defaultMonitor: false },\n";
const communityOld = "  { id: 'community', name: '에코디커뮤니티', domain: 'community.ekodi.kr', url: 'https://community.ekodi.kr', group: 'ministry', defaultState: 'planned', defaultMonitor: false },";
const communityNew = "  { id: 'community', name: '에코디커뮤니티', domain: 'community.ekodi.kr', url: 'https://community.ekodi.kr', group: 'ministry', defaultState: 'active', defaultMonitor: true },\n  { id: 'social', name: 'EKODI Social', domain: 'social.ekodi.kr', url: 'https://social.ekodi.kr/health', group: 'platform', defaultState: 'active', defaultMonitor: true },";
if (!api.includes(missionLine)) throw new Error('api-worker.js: legacy mission service contract not found');
if (!api.includes(communityOld)) throw new Error('api-worker.js: community service contract not found');
api = api.replace(missionLine, '').replace(communityOld, communityNew);
if (api.includes("id: 'mission'")) throw new Error('api-worker.js: legacy mission service remains');
await writeFile(apiPath, api);

const boundaryPath = 'platform-boundaries.json';
const boundaries = JSON.parse(await readFile(boundaryPath, 'utf8'));
const social = boundaries.platforms?.social;
const control = boundaries.platforms?.['control-api'];
const admin = boundaries.platforms?.['admin-auth'];
if (!social || !control || !admin) throw new Error('platform-boundaries.json: required boundaries missing');
social.sharedDependencies = ['control-api Social registry', 'public social provider APIs'];
social.database = 'ekodi-auth D1 via control-api with bundled static registry fallback';
if (!control.source.includes('social-registry-api.js')) control.source.push('social-registry-api.js');
if (!admin.source.includes('social-admin*')) admin.source.push('social-admin*');
await writeFile(boundaryPath, `${JSON.stringify(boundaries, null, 2)}\n`);

console.log('Community canonical cleanup applied.');
