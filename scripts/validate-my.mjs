import { readFile } from 'node:fs/promises';

const files={
  html:'my/index.html',
  app:'my/app.js',
  userAi:'my/user-ai.js',
  userAiUi:'my/user-ai-ui.js',
  userAiProviderUi:'my/user-ai-provider-ui.js',
  userUiCss:'my/user-ui.css',
  membershipJs:'my/membership-summary.js',
  membershipCss:'my/membership-summary.css',
  userServices:'my/user-services.js',
  workspaceSync:'my/workspace-selector-sync.js',
  workspaceCss:'my/workspace-selector-shell.css',
  deviceCareHtml:'my/device-care/index.html',
  deviceCareJs:'my/device-care.js',
  deviceCareCss:'my/device-care.css',
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
must('html','/membership-summary.js');
must('html','/membership-summary.css');
must('html','href="/device-care/">내 PC</a>');
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
must('userAiProviderUi','connectionGuide');
must('userAiProviderUi','AI 연결 변경');
must('userUiCss','position:fixed');
must('userUiCss','body[data-ekodi-ui="USER"] .topbar{position:fixed');
must('userUiCss','padding-top:calc(62px + env(safe-area-inset-top))');
mustNot('userUiCss','.workspace-control{display:none!important}');
mustNot('html','class="workspace-control"');
must('membershipJs','/api/membership/portfolio');
must('membershipJs','USER_SERVICES');
must('membershipJs','function portfolioRows(data)');
must('membershipJs',"return { label: '이용 가능'");
must('membershipJs',"return { label: '사용 중'");
must('membershipJs',"return { label: '구독 중'");
must('membershipJs','상태 확인 지연');
must('membershipJs','renderPortfolio(null, { degraded: true })');
mustNot('membershipJs','/api/membership/me');
must('membershipCss','.membership-service-state');
must('membershipCss','.membership-summary-warning');
must('userServices','USER_SERVICES');
must('userServices','"id": "support"');
must('workspaceSync','window.EKODIShell');
must('workspaceSync','ekodiWorkspaceOrder');
must('workspaceCss','--ekodi-shell-accent');
must('deviceCareHtml','FREE MEMBER');
must('deviceCareHtml','무료회원');
must('deviceCareHtml','개인 파일 접근 안 함');
must('deviceCareHtml','Windows 설정 자동변경 안 함');
must('deviceCareHtml','Device Agent');
must('deviceCareJs','CACHE_ALLOWLIST');
must('deviceCareJs','registration.update()');
must('deviceCareJs','window.confirm');
must('deviceCareJs','ekodi_device_care_history_v1');
mustNot('deviceCareJs','localStorage.clear(');
mustNot('deviceCareJs','/api/control/devices');
must('deviceCareCss','.device-care-section');
must('worker',"service:'ekodi-my'");
must('worker',"identity:'person-scoped'");
must('worker',"privacy:'private-first'");
must('prod','my.ekodi.kr');
must('prod','DATA_ENABLED = "true"');
must('staging','DATA_ENABLED = "false"');
mustNot('staging','my.ekodi.kr');
must('auth',"'my':{name:'My EKODI'");
must('auth',"returnTo:'https://my.ekodi.kr/'");
must('router','isRegistryUserService');
must('router',"site==='portal'||isRegistryUserService");
must('router','await loadClientAuth()');
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
console.log('My EKODI validation passed: USER UI, truthful universal membership lifecycle states, Support AI registry coverage, free member Device Care, EKODI User AI onboarding, Shell-synced Workspace context, mobile fixed header, isolated staging, central auth and guarded production rollout are present.');
