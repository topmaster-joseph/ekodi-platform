import { readFile } from 'node:fs/promises';

const files = {
  html: 'author/index.html',
  app: 'author/app.js',
  worker: 'author-worker.js',
  auth: 'auth-site/author-auth.js',
  router: 'auth-site/auth-router.js',
  foundation: 'supabase/migrations/20260816010000_author_ai_foundation.sql',
  creator: 'supabase/migrations/20260816155146_creator_ai_my_ekodi.sql',
  creatorPolicy: 'supabase/migrations/20260816155153_creator_portfolio_person_policy_hardening.sql',
  creatorPrivatePolicy: 'supabase/migrations/20260816155454_creator_portfolio_private_person_helper.sql',
  creatorRlsOptimization: 'supabase/migrations/20260816155749_creator_portfolio_rls_initplan_optimization.sql',
  membership: 'supabase/migrations/20260816020000_author_membership_paid_ai_gate.sql',
  access: 'supabase/functions/author-access-api/index.ts',
  ai: 'supabase/functions/author-ai-api/index.ts',
  production: 'wrangler.author.toml',
  staging: 'wrangler.author.staging.toml',
  manifest: 'deploy/manifests/author.worker.json',
};
const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')])));
function must(key, marker) { if (!content[key].includes(marker)) throw new Error(`Creator validation failed: ${key} missing ${marker}`); }
function mustNot(key, marker) { if (content[key].includes(marker)) throw new Error(`Creator validation failed: ${key} contains forbidden ${marker}`); }

must('html', 'Creator AI');
must('html', 'CREATOR APPROVED');
must('html', '원고는 기본 비공개');
must('html', 'FREE는 AI 과금 0원');
must('html', 'my.ekodi.kr');
for (const mode of ['writer','video','podcast','lecture','research','visual','mission','ai']) must('app', `${mode}: {`);
must('app', 'creator_mode: concept.creatorMode');
must('app', "functionFetch('author-ai-api'");
must('app', 'publish_creator_to_my_ekodi');
must('app', "'author_approved'");
must('app', "'publish_ready'");
must('app', "'books.handoff.requested'");
must('app', 'membership.paid_ai_active');
must('worker', "service: 'ekodi-author-ai'");
must('worker', "product: 'ekodi-creator-ai'");
must('worker', 'myEkodiPortfolio: true');
must('worker', "chiefAiProtocol: 'author-events-v1'");
must('auth', 'author-access-api');
must('auth', 'Creator AI');
must('router', "site==='author'");
must('foundation', 'alter table public.author_projects enable row level security');
must('foundation', 'owner_user_id = auth.uid()');
must('foundation', "chief_share_level text not null default 'metadata'");
must('foundation', 'create table if not exists public.author_agent_jobs');
must('creator', 'create table if not exists public.creator_portfolio_items');
must('creator', 'publish_creator_to_my_ekodi');
must('creator', "visibility text not null default 'private'");
must('creator', 'workspace_key text not null');
must('creator', 'creator_human_approval_required');
must('creatorPolicy', 'current_person_id');
must('creatorPrivatePolicy', 'private.current_person_id');
must('creatorPrivatePolicy', 'drop function if exists public.current_person_id()');
must('creatorRlsOptimization', '(select auth.uid())');
must('creatorRlsOptimization', '(select private.current_person_id())');
must('membership', "('free', 'FREE', false, 0");
must('membership', 'billable_ai_enabled boolean not null default false');
must('membership', "reason', 'paid_membership_required'");
must('membership', 'grant execute on function public.author_reserve_ai_units(uuid, text, integer) to service_role');
must('access', 'SUPABASE_SERVICE_ROLE_KEY');
must('access', 'validReturn');
must('access', 'paid_ai_active');
must('access', 'my_ekodi_url');
must('ai', 'author_reserve_ai_units');
must('ai', 'paid_membership_required');
must('ai', 'OPENAI_API_KEY');
must('ai', 'store:false');
must('ai', 'https://api.openai.com/v1/responses');
must('ai', 'Creator AI');
must('ai', 'creator_mode');
must('production', 'author.ekodi.kr');
mustNot('staging', 'author.ekodi.kr');
must('manifest', 'author-events-v1');

const combined = Object.values(content).join('\n');
for (const secretLike of ['sk-proj-', 'sk-svcacct-', 'SUPABASE_SERVICE_ROLE_KEY="', "SUPABASE_SERVICE_ROLE_KEY='"]) {
  if (combined.includes(secretLike)) throw new Error(`Creator validation failed: secret-like material ${secretLike}`);
}
console.log('Creator AI source validation passed: multi-format creator modes, private-by-default projects, person-scoped My EKODI portfolio handoff, private-schema optimized RLS, central auth, human publish gate, paid-only AI financial firewall, Chief AI event contract and isolated staging are present.');
