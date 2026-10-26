import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {devotionAdminSession,devotionOverride,saveDevotionOverride,validateDevotionActivities} from '../devotional-admin-api.js';
import {resolveDevotion} from '../devotional-activities.js';

const TOKEN = 'devotion-session-local-test-token-12345';
const HASH = createHash('sha256').update(TOKEN).digest('hex');

function fixtureDb(role='super_admin'){
 let override=null;
 return {
   prepare(sql){
     return {bind(...args){
       return {
         async first(){
           if(sql.includes('FROM sessions s'))return args[0]===HASH?{email:'admin@example.test',role}:null;
           if(sql.includes('FROM devotion_activity_overrides'))return override?.date===args[0]?override:null;
           throw Error('unexpected query: '+sql);
         },
         async run(){
           if(sql.includes('INSERT OR IGNORE INTO devotion_activity_overrides')){
             if(override)return{meta:{changes:0}};
             override={date:args[0],activities_json:args[1],status:args[2],revision:1,updated_at:args[4]};
             return {meta:{changes:1}};
           }
           if(sql.includes('UPDATE devotion_activity_overrides')){
             if(!override||override.date!==args[4]||override.revision!==args[5])return{meta:{changes:0}};
             override={date:args[4],activities_json:args[0],status:args[1],revision:override.revision+1,updated_at:args[3]};
             return{meta:{changes:1}};
           }
           throw Error('unexpected mutation: '+sql);
         }
       };
     }};
   }
 };
}
const req=(method,body,withToken=true)=>new Request('https://ekodi.kr/bible/api/bible/devotion',{
 method,headers:{...(withToken?{authorization:'Bearer '+TOKEN}:{}),...(body?{'content-type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});

test('only EKODI verified super admin can write creative overrides',async()=>{
 const db=fixtureDb(),env={DB:db};
 assert.equal(await devotionAdminSession(req('GET',null,false),env),null);
 assert.equal(await devotionAdminSession(req('GET',null,true),{DB:fixtureDb('viewer')}),null);
 const admin=await devotionAdminSession(req('GET',null,true),env);
 assert.equal(admin.role,'super_admin');
 const day=resolveDevotion('2026-10-26');
 const payload={date:day.date,activities:{...day.activities,theme:'새로운 주제'},status:'draft',expectedRevision:0};
 assert.ok(validateDevotionActivities(payload.activities));
 let result=await saveDevotionOverride(req('PUT',payload),env,admin,resolveDevotion);
 assert.equal(result.status,200);
 assert.equal((await result.json()).revision,1);
 assert.equal((await devotionOverride(env,day.date)).status,'draft');
 result=await saveDevotionOverride(req('PUT',payload),env,admin,resolveDevotion);
 assert.equal(result.status,409,'stale revisions cannot silently overwrite');
 result=await saveDevotionOverride(req('PUT',{...payload,expectedRevision:1,status:'published'}),env,admin,resolveDevotion);
 assert.equal(result.status,200);
 assert.equal((await devotionOverride(env,day.date)).status,'published');
 result=await saveDevotionOverride(req('PUT',payload),env,null,resolveDevotion);
 assert.equal(result.status,403);
});
test('editing cannot change canonical Scripture or inject external audio/image URLs',()=>{
 const d=resolveDevotion('2026-10-26');
 const clean=validateDevotionActivities({
   ...d.activities,
   passage:'악의적인 본문 바꾸기',
   scripture:[{verses:[{text:'훼손된 성경'}]}],
   song:{...d.activities.song,mrUrl:'https://untrusted.example/music.mp3'},
   illustration:{src:'javascript:alert(1)',alt:'text'}
 });
 assert.ok(clean);
 assert.equal('scripture' in clean,false);
 assert.equal('passage' in clean,false);
 assert.equal(clean.song.mrUrl,'');
 assert.equal(clean.illustration.src,'');
});
