import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
test('onsite management page requires authenticated privileged API',()=>{
 const html=read('../presence/index.html'),js=read('../presence/app.js');
 assert.match(html,/noindex,nofollow/);
 assert.match(html,/id="operator" hidden/);
 assert.match(js,/if\(response\.status===403\)/);
 assert.match(js,/if\(!response\.ok\)/);
 assert.match(js,/mountPresenceOperator\(/);
});
test('never reveals shared service role to browser',()=>{
 const js=read('../presence/app.js')+read('../presence/operator.js');
 assert.doesNotMatch(js,/SERVICE_ROLE_KEY|sb_secret_/);
 assert.match(js,/\?tenant=ekodi-church/);
 assert.match(js,/history\.replaceState/);
});
test('identity assignment uses human chosen person and reversible undo',()=>{
 const ui=read('../presence/operator.js');
 assert.match(ui,/data-resolution-person/);
 assert.match(ui,/verification_reason/);
 assert.match(ui,/data-unlink/);
 assert.doesNotMatch(ui,/face_embedding|face_match/);
});
test('hidden personal confirmation controls stay hidden',()=>{assert.match(read('../presence/styles.css'),/\.ekodi-presence \[hidden\]\{display:none!important\}/);});
