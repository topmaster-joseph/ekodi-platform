import fs from 'node:fs';

const policyPath = new URL('../config/discovery-projection-policy.json', import.meta.url);
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

const failures = [];

if (policy.defaultDecision !== 'deny-undocumented-discovery') failures.push('defaultDecision must deny undocumented discovery');
if (policy.security?.robotsIsSecurityBoundary !== false) failures.push('robots.txt must never be treated as a security boundary');
if (policy.security?.secureProjectionPrecedesDiscoveryProjection !== true) failures.push('Secure Projection must precede Discovery Projection');
if (policy.botIntent?.training !== 'deny') failures.push('training crawlers must default to deny');
if (policy.botIntent?.['unknown-scraper'] !== 'challenge-or-deny') failures.push('unknown scrapers must challenge or deny');
if (policy.structuredData?.allowHiddenPrivateFacts !== false) failures.push('structured data must not expose hidden private facts');
if (policy.routeDefaults?.admin !== 'noindex-nofollow-noarchive') failures.push('admin routes must be noindex/nofollow/noarchive');
if (policy.routeDefaults?.api !== 'noindex-nofollow-noarchive') failures.push('API routes must be noindex/nofollow/noarchive');

const search = new Set(policy.crawlerPolicy?.['search-index'] || []);
const answer = new Set(policy.crawlerPolicy?.['answer-retrieval'] || []);
const training = new Set(policy.crawlerPolicy?.['training-deny'] || []);
for (const bot of training) {
  if (search.has(bot) || answer.has(bot)) failures.push(`${bot} cannot be both training-denied and discovery-allowed`);
}
if (policy.crawlerPolicy?.verifiedIdentityRequiredAtEdge !== true) failures.push('verified bot identity must be required at edge');
if (policy.crawlerPolicy?.trustUserAgentAlone !== false) failures.push('User-Agent alone must not be trusted');

if (failures.length) {
  console.error('Discovery Projection validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Discovery Projection policy: PASS');
