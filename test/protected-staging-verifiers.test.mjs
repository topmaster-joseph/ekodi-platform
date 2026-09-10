import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cases=[
  ['Bible Conversation','.github/workflows/deploy-bible.yml','wrangler.bible.staging.toml'],
  ['Life AI','.github/workflows/deploy-life-ai.yml','wrangler.life.staging.toml'],
  ['Support Opportunity','.github/workflows/deploy-support-opportunity.yml','wrangler.support.staging.toml'],
];

for(const [label,path,config] of cases){
  test(`${label} keeps Cloudflare Access on while validating isolated staging`,()=>{
    const source=readFileSync(path,'utf8');
    assert.match(source,/Www-Authenticate: Cloudflare-Access/i);
    assert.match(source,/remote_protected=0/);
    assert.ok(source.includes("WRANGLER_VERSION: '4.129.0'"));
    assert.match(source,/verify_base="\$STAGING_URL"/);
    assert.ok(source.includes(`wrangler@\${WRANGLER_VERSION} dev --config ${config} --local`));
    assert.match(source,/verify_base='http:\/\/127\.0\.0\.1:/);
  });
}
