import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const worker = await readFile(new URL('../wrangler.site.toml', import.meta.url),'utf8');
const surface=await readFile(new URL('../singles-surface.js',import.meta.url),'utf8');
const edge=await readFile(new URL('../supabase/functions/singles-api/index.ts',import.meta.url),'utf8');

test('EKODI Donghaeng can prepare authenticated operator controls without launching member storage, social or payments',()=>{
 for(const flag of ['SINGLES_M1_ENABLED','SINGLES_SOCIAL_ENABLED','SINGLES_PAID_ACTIONS_ENABLED','SINGLES_BANK_TRANSFER_ENABLED','SINGLES_BANK_VERIFICATION_ENABLED']){
  assert.match(worker,new RegExp('^'+flag+' = "false"$', 'm'),flag);
 }
 for(const field of ['SINGLES_API_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])assert.match(worker,new RegExp('^'+field+' = "[^"\\n]+"$', 'm'));
 assert.match(surface,/admin_preparation_enabled:prepReady/);
 assert.match(surface,/if\(!enabled\(env\)&&!adminPreparation\)return json\(\{error:'singles_enrollment_not_launched'\},503\)/);
 assert.match(edge,/SINGLES_ONBOARDING_ENABLED/);
 assert.doesNotMatch(worker,/^SUPABASE_SERVICE_ROLE_KEY\s*=/m);
});
