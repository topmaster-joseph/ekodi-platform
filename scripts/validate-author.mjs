import { readFile } from 'node:fs/promises';

const files = {
  html: 'author/index.html',
  app: 'author/app.js',
  worker: 'author-worker.js',
  auth: 'auth-site/author-auth.js',
  router: 'auth-site/auth-router.js',
  migration: 'supabase/migrations/20260816010000_author_ai_foundation.sql',
  membership: 'supabase/migrations/20260816020000_author_membership_paid_ai_gate.sql',
  access: 'supabase/functions/author-access-api/index.ts',
  ai: 'supabase/functions/author-ai-api/index.ts',
  production: 'wrangler.author.toml',
  staging: 'wrangler.author.staging.toml',
  manifest: 'deploy/manifests/author.worker.json',
};
const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')])));
function must(key, marker) { if (!content[key].includes(marker)) throw new Error(`Author validation failed: ${key} missing ${marker}`); }
function mustNot(key, marker) { if (content[key].includes(marker)) throw new Error(`Author validation failed: ${key} contains forbidden ${marker}`); }

must('html', 'EKODI Author AI');
must('html', 'AUTHOR APPROVED');
must('html', '원고는 기본 비공개');
must('html', 'FREE는 AI 과금 0원');
must('html', '결제가 확인된 유료회원');
must('app', "status: 'plan'");
must('app', "'author_approved'");
must('app', "'publish_ready'");
must('app', "'books.handoff.requested'");
must('app', "functionFetch('author-ai-api'");
must('app', 'membership.paid_ai_active');
must('worker', "service: 'ekodi-author-ai'");
must('worker', "chiefAiProtocol: 'author-events-v1'");
must('auth', 'author-access-api');
must('router', "site==='author'");
must('migration', 'alter table public.author_projects enable row level security');
must('migration', 'owner_user_id = auth.uid()');
must('migration', "chief_share_level text not null default 'metadata'");
must('migration', 'create table if not exists public.author_agent_jobs');
must('membership', "('free', 'FREE', false, 0");
must('membership', 'billable_ai_enabled boolean not null default false');
must('membership', "reason', 'paid_membership_required'");
must('membership', 'grant execute on function public.author_reserve_ai_units(uuid, text, integer) to service_role');
must('access', 'SUPABASE_SERVICE_ROLE_KEY');
must('access', 'validReturn');
must('access', 'paid_ai_active');
must('ai', 'author_reserve_ai_units');
must('ai', 'paid_membership_required');
must('ai', 'OPENAI_API_KEY');
must('ai', 'store:false');
must('ai', 'https://api.openai.com/v1/responses');
must('production', 'author.ekodi.kr');
mustNot('staging', 'author.ekodi.kr');
must('manifest', 'author-events-v1');

const combined = Object.values(content).join('\n');
for (const secretLike of ['sk-proj-', 'sk-svcacct-', 'SUPABASE_SERVICE_ROLE_KEY="', "SUPABASE_SERVICE_ROLE_KEY='"]) {
  if (combined.includes(secretLike)) throw new Error(`Author validation failed: secret-like material ${secretLike}`);
}
console.log('Author AI source validation passed: private projects, central auth, human publish gate, paid-only AI financial firewall, Chief AI event contract and isolated staging are present.');
