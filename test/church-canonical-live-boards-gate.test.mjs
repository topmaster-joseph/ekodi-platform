import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.');
const read=path=>readFileSync(resolve(root,path),'utf8');
const workflow=read('.github/workflows/deploy-ekodi-church-homepage.yml');
const name='Verify six-menu Church public notices, schedules and preserved worship on live canonical release';
const step=workflow.slice(workflow.indexOf('      - name: '+name),workflow.indexOf('      - name: Verify production church together (partnership) page'));
const notices=read('sites/ekodi-church/notices/index.html');
const schedules=read('sites/ekodi-church/schedule/index.html');
const home=read('sites/ekodi-church/index.html');
const worship=read('sites/ekodi-church/worship/2026-11-08/index.html');

test('new public route canary is canonical C3-only, never the default legacy source',()=>{
 assert.ok(step.startsWith('      - name: '+name));
 assert.match(step,/if: vars\.CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED == 'true'/);
 assert.match(step,/test "\$\{CHURCH_RELEASE_SOURCE_MODE:-\}" = canonical/);
 assert.match(workflow,/if: vars\.CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED != 'true'/);
 assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs/);
 assert.match(workflow,/--project-name ekodi-church --branch main/);
});

test('canonical public canary verifies real routes, unique content, shared calendar and selected six-menu script',()=>{
 for(const path of [
   '/ekodichurch/?release=','/ekodichurch/notices/?release=',
   '/ekodichurch/schedule/?release=','/ekodichurch/church-section-nav.js?release=',
   '/ekodichurch/church-shared-schedules.js?release=',
   '/ekodichurch/worship/2026-11-08/?release=',
   '/ekodichurch/church-release.json?release='
 ])assert.ok(step.includes(path),'missing route check '+path);
 for(const guard of [
   'data-church-public-page="notices"','data-church-notices',
   'data-church-public-page="schedule"','data-church-schedule',
   'data-church-shared-schedules','공동의회',
   'verify-church-header-navigation.mjs',
   'preservedPublicWorship.mergedPR == 150',
   'preservedPublicWorship.preservationPR == 151',
   'payloadSha256 == $digest'
 ])assert.ok(step.includes(guard),'missing independent production evidence '+guard);
 assert.match(notices,/data-church-public-page="notices"/);
 assert.match(schedules,/data-church-public-page="schedule"/);
 assert.match(home,/data-church-shared-schedules/);
 assert.match(worship,/공동의회/);
});

test('new check is read-only verification and preserves existing role, multi-locale, security and release gates',()=>{
 assert.doesNotMatch(step,/wrangler|pages deploy|CLOUDFLARE_API_TOKEN|secrets\.|update.*database|DELETE FROM|GH_TOKEN/i);
 assert.match(step,/jq -e --arg sha "\$release" --arg digest "\$CHURCH_PAYLOAD_SHA256"/);
 assert.match(step,/for attempt in \$\(seq 1 18\)/);
 assert.match(step,/exit 1/);
 assert.match(workflow,/Verify rendered nine-language church homepage and canonical devotion entry/);
 assert.match(workflow,/Verify approved homepage on native Chromium across nine languages and PC\/mobile/);
 assert.match(workflow,/Verify Church live-state API contract/);
 assert.match(workflow,/Verify production Church home, canonical devotion and exact release/);
});
