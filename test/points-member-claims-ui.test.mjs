import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('my/points/app.js'),html=read('my/points/index.html'),css=read('my/points/styles.css');
const staging=read('admin-staging-worker.js'),stagingToml=read('wrangler.admin.staging.toml'),wf=read('.github/workflows/deploy-control-api.yml');
const sql=read('supabase/migrations/20261101020000_ekodi_points_member_claims_view.sql');
test('member claim panel never awards in the browser and only uses self-scoped RPCs',()=>{
  assert.match(html,/id="claimSection" hidden/);
  for(const rpc of ['ekodi_points_claimable_adapters','ekodi_points_my_claims','ekodi_points_submit_evidence_claim'])assert.match(app,new RegExp(`sb\\.rpc\\('${rpc}'`));
  assert.doesNotMatch(app,/award_evidence|admin_decide|ekodi_point_ledger|from\('ekodi_point/);
  assert.match(app,/claimSection\.hidden=true;claimAdapter\.replaceChildren\(\);claimList\.replaceChildren\(\)/);
  assert.match(app,/if\(revision!==viewRevision\)return;\n    if\(optionError\|\|mineError\)return;/);
  assert.match(app,/label\.textContent=/);assert.doesNotMatch(app,/innerHTML/);
  assert.match(css,/\.login\[hidden\][^{]*\{display:none!important\}/);
});
test('member read RPCs are authenticated, self-scoped and hide reviewer data',()=>{
  assert.match(sql,/grant execute on function public\.ekodi_points_claimable_adapters\(text\), public\.ekodi_points_my_claims\(text\)\n  to authenticated/);
  assert.match(sql,/where site_id=p_site and person_id=v_person/);
  assert.doesNotMatch(sql,/'decided_by'|'decision_note'/);
});
test('admin staging forwards /api to the isolated staging Control API (never production)',()=>{
  assert.match(staging,/incoming\.pathname==='\/api'\|\|incoming\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(staging,/staging_control_api_unbound/);
  assert.match(stagingToml,/binding = "CONTROL_API"\nservice = "ekodi-auth-api-staging"/);
  assert.doesNotMatch(stagingToml,/service = "ekodi-auth-api"\n/);
  assert.match(wf,/POINTS_SOURCE_ENV = "development"\n\s+POINTS_SUPABASE_URL = "https:\/\/lxcxwbdwwojjkgybbqii\.supabase\.co\/"/);
  assert.doesNotMatch(wf,/POINTS_SUPABASE_URL = "https:\/\/renzehysxirjilvdxacv/);
});

test('admin staging lane is dispatchable by the orchestrator after token merges (#6739)',()=>{
  const lane=read('.github/workflows/deploy-admin-staging.yml');
  const converge=read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(lane,/on:\n  # Orchestrator post-merge dispatch[\s\S]*?workflow_dispatch:\n    inputs:\n      release_branch_ref:/);
  assert.match(lane,/if: github\.event_name != 'pull_request'/);
  assert.match(lane,/EKODI_RELEASE_BRANCH_REF: \$\{\{ github\.event\.inputs\.release_branch_ref \|\| '' \}\}/);
  assert.match(lane,/CLOUDFLARE_ACCOUNT_ID: 46aad4738793fbaca88574832a2ccc0f/);
  assert.match(converge,/const adminStagingTouched=changedFiles\.some/);
  assert.match(converge,/'points-governance-admin\.js'/);
  assert.match(converge,/if\(adminStagingTouched\)\{\n    const dispatch=await api\('\/actions\/workflows\/deploy-admin-staging\.yml\/dispatches'/);
});
