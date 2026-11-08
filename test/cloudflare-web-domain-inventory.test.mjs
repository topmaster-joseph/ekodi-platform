import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const file=new URL('../scripts/cloudflare-web-domain-inventory.mjs',import.meta.url);
test('Cloudflare domain audit is read-only and flags mail/wildcard ambiguity',()=>{
  const source=readFileSync(file,'utf8');
  const result=execFileSync(process.execPath,[file.pathname,'--self-test'],{encoding:'utf8',timeout:10000});
  assert.match(result,/self-test OK/);
  assert.match(source,/destructiveActions:0/);
  assert.match(source,/emailOrVerificationRecord/);
  assert.match(source,/dnsOnlyUnknownPurpose/);
  assert.doesNotMatch(source,/method\s*:\s*['"`](POST|PUT|PATCH|DELETE)/i);
});

test('Pages inventory uses plain first GET and bounded 20-item continuation without false completeness',()=>{
  const source=readFileSync(file,'utf8');
  assert.match(source,/function inventoryPageRequest\(endpoint,page\)/);
  assert.match(source,/const perPage=pagesProjects\?20:100/);
  assert.match(source,/if\(pagesProjects&&page===1\)return\{url:endpoint,perPage\}/);
  assert.match(source,/if\(knownPages&&page>=count\)return all/);
  assert.match(source,/if\(!knownPages&&data\.result\.length<request\.perPage\)return all/);
  assert.match(source,/throw new Error\('Inventory pagination exceeded 30 pages'\)/);
  assert.doesNotMatch(source,/method\s*:\s*['"`](POST|PUT|PATCH|DELETE)/i);
});

test('Cloudflare source evidence shows only approved projects and never leaks provider config or tokens',async()=>{
  const {auditKnownCloudflarePagesProjectSources:audit}=await import('../scripts/classify-cloudflare-pages-source.mjs');
  const result=audit([
    {
      name:'ekodi-church',production_branch:'main',
      source:{type:'github',config:{owner:'topmaster-joseph',repo_name:'ekodi-church',secret:'DO-NOT-LEAK'}},
      deployment_configs:{production:{env_vars:{PRIVATE_TOKEN:'DO-NOT-LEAK'}}},
      canonical_deployment:{
        environment:'production',is_skipped:false,
        latest_stage:{status:'success'},
        created_on:'2026-11-08T00:01:00Z',
        deployment_trigger:{type:'github:push',metadata:{
          branch:'main',commit_hash:'a'.repeat(40),commit_message:'DO-NOT-LEAK'
        }}
      }
    },
    {name:'ekodilab',source:{type:'github',config:{owner:'topmaster-joseph',repo_name:'ekodi-platform'}},
      canonical_deployment:{environment:'preview',is_skipped:true}},
    {name:'private-customer-project',source:{config:{repo_name:'DO-NOT-LEAK'}}}
  ]);
  assert.equal(result.contract,'ekodi.cloudflare-pages-source-metadata.v1');
  assert.equal(result.observedRegisteredProjects,2);
  assert.equal(result.totalRegisteredProjects,3);
  assert.equal(result.rows[0].configuredSource,'registered-legacy-repository-configured');
  assert.equal(result.rows[0].productionTriggerCommitSha,'a'.repeat(40));
  assert.equal(result.rows[0].status,'production-trigger-metadata-observed');
  assert.equal(result.rows[0].repositoryDeletionAuthorized,false);
  assert.equal(result.rows[1].configuredSource,'canonical-repository-configured');
  assert.equal(result.rows[1].status,'incomplete-production-metadata');
  assert.equal(result.rows[2].status,'not-listed-in-this-account');
  for(const flag of ['repositoryDeletionAuthorized','productionPagesBindingVerified',
    'independentRollbackVerified','exactProtectedReleaseReceiptVerified']){
    assert.equal(result[flag],false,flag);
  }
  assert.doesNotMatch(JSON.stringify(result),/DO-NOT-LEAK|env_vars|build_config|commit_message|private-customer-project/);
});

test('Cloudflare source metadata is unknown for ad-hoc or malformed production trigger and rejects duplicates',async()=>{
  const {auditKnownCloudflarePagesProjectSources:audit}=await import('../scripts/classify-cloudflare-pages-source.mjs');
  const report=audit([{name:'cheonggye-market',
    source:null,production_branch:'main',
    canonical_deployment:{environment:'production',is_skipped:false,
      latest_stage:{status:'success'},
      deployment_trigger:{type:'ad_hoc',metadata:{commit_hash:'unverified',branch:'main'}}}
  }]);
  const row=report.rows.find(x=>x.project==='cheonggye-market');
  assert.equal(row.configuredSource,'unknown');
  assert.equal(row.productionTriggerCommitSha,null);
  assert.equal(row.productionTriggerKind,'ad_hoc');
  assert.equal(row.providerSourceProvesActualPublisher,false);
  assert.equal(row.status,'incomplete-production-metadata');
  assert.throws(()=>audit([{name:'ekodilab'},{name:'ekodilab'}]),/duplicate-cloudflare-project-source-evidence/);
  assert.throws(()=>audit({}),/cloudflare-project-evidence-array-required/);
});
