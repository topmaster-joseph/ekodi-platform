import { readFile } from 'node:fs/promises';

const files={
  html:'my/index.html',
  app:'my/app.js',
  worker:'my-worker.js',
  prod:'wrangler.my.toml',
  staging:'wrangler.my.staging.toml',
  auth:'auth-site/client-auth.js',
  router:'auth-site/auth-router.js',
  manifest:'deploy/manifests/my.worker.json',
  creatorMigration:'supabase/migrations/20260816155146_creator_ai_my_ekodi.sql',
  creatorPrivate:'supabase/migrations/20260816155454_creator_portfolio_private_person_helper.sql',
  creatorOptimized:'supabase/migrations/20260816155749_creator_portfolio_rls_initplan_optimization.sql'
};
const content=Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,path])=>[key,await readFile(path,'utf8')])));
function must(key,marker){if(!content[key].includes(marker))throw new Error(`My EKODI validation failed: ${key} missing ${marker}`)}
function mustNot(key,marker){if(content[key].includes(marker))throw new Error(`My EKODI validation failed: ${key} contains forbidden ${marker}`)}

must('html','My EKODI');
must('html','CREATOR PORTFOLIO');
must('html','PRIVATE FIRST');
must('html','NO DATA MONOLITH');
must('html','/config.js');
must('app','creator_portfolio_items');
must('app','ekodi_token');
must('app','visibilityLabel');
must('app','dataEnabled');
must('worker',"service:'ekodi-my'");
must('worker',"identity:'person-scoped'");
must('worker',"privacy:'private-first'");
must('prod','my.ekodi.kr');
must('prod','DATA_ENABLED = "true"');
must('staging','DATA_ENABLED = "false"');
mustNot('staging','my.ekodi.kr');
must('auth',"'my':{name:'My EKODI'");
must('auth',"returnTo:'https://my.ekodi.kr/'");
must('router',"site==='my'");
must('manifest','creatorPortfolio');
must('creatorMigration','create table if not exists public.creator_portfolio_items');
must('creatorMigration',"visibility text not null default 'private'");
must('creatorPrivate','private.current_person_id');
must('creatorOptimized','(select private.current_person_id())');

const combined=Object.values(content).join('\n');
for(const secretLike of ['sk-proj-','sk-svcacct-','SUPABASE_SERVICE_ROLE_KEY="',"SUPABASE_SERVICE_ROLE_KEY='"]){
  if(combined.includes(secretLike))throw new Error(`My EKODI validation failed: secret-like material ${secretLike}`);
}
console.log('My EKODI validation passed: isolated staging, central Google auth, person-scoped private Creator portfolio, runtime config and guarded production manifest are present.');
