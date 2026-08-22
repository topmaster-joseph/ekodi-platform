import { readFile } from 'node:fs/promises';

const files={
  html:'my/index.html',
  app:'my/app.js',
  userAi:'my/user-ai.js',
  userAiUi:'my/user-ai-ui.js',
  userUiCss:'my/user-ui.css',
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
must('html','data-ekodi-ui="USER"');
must('html','EKODI USER AI');
must('html','MY SPACES');
must('html','MY PLATFORMS');
must('html','CREATOR PORTFOLIO');
must('html','내 선택이 우선');
must('html','공간별 데이터');
must('html','/config.js');
must('html','/user-ui.css');
must('html','/user-ai-ui.js');
must('app','creator_portfolio_items');
must('app','current_site_access');
must('app','current_site_workspaces');
must('app','ekodi_token');
must('userAi',"name:'EKODI User AI'");
must('userAi',"role:'개인 AI 비서'");
must('userAi',"boundary:'suggest-and-handoff'");
must('userAi','dependsOnExternalAI:false');
must('userAi','specialistDirectControl:false');
must('userAiUi','buildUserSuggestions');
must('userAiUi','collectContext');
must('userUiCss','.workspace-control{display:none!important}');
must('userUiCss','position:fixed');
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

const visibleWorkspaceChooserCount=(content.html.match(/id="workspaceList"/g)||[]).length;
if(visibleWorkspaceChooserCount!==1)throw new Error(`My EKODI validation failed: expected one visible Workspace chooser, found ${visibleWorkspaceChooserCount}`);

const combined=Object.values(content).join('\n');
for(const secretLike of ['sk-proj-','sk-svcacct-','SUPABASE_SERVICE_ROLE_KEY="',"SUPABASE_SERVICE_ROLE_KEY='"]){
  if(combined.includes(secretLike))throw new Error(`My EKODI validation failed: secret-like material ${secretLike}`);
}
console.log('My EKODI validation passed: USER UI, EKODI User AI suggest-and-handoff boundary, single visible Workspace chooser, mobile fixed header, isolated staging, central auth and guarded production rollout are present.');
