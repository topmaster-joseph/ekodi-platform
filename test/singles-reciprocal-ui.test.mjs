import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
const api=await readFile(new URL('../supabase/functions/singles-api/social.ts',import.meta.url),'utf8');
test('only interest recipient gets accept/decline buttons; initiator waits',()=>{
 assert.match(app,/if\(r\.status==='pending'&&r\.incoming===true\)/);
 assert.match(app,/if\(r\.status==='pending'&&r\.incoming!==true\)/);
 assert.match(api,/\.eq\('to_user_id',userId\)/);
 assert.match(app,/상대방의 답변을 기다리고 있습니다/);
});
test('free interest response but premium message send and rsvp enforced server-side',()=>{
 assert.match(api,/if\(decisionId&&method==='POST'\)/);
 assert.match(api,/if\(!await subscribed\(admin,userId\)\)/g);
 assert.match(api,/source==='verified_central_billing'/);
 assert.match(api,/if\(!billingEnabled\(\)\)return false/);
});
