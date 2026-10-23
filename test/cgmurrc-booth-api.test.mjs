import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  BOOTH_API_PREFIX, BOOTH_EVENT, BOOTH_LINK_BASE, MEMBER_WRITES_CLOSE_AT, LINKS_VALID_UNTIL,
  handleCgmurrcBooth, hashBoothKey, newBoothKey,
} from '../cgmurrc-booth-api.js';
import customerEntryWorker from '../customer-entry-worker.js';

const MIGRATION=fs.readFileSync(new URL('../migrations/0205_cgmurrc_booth_shifts.sql',import.meta.url),'utf8');
const ME='https://ekodi.kr'+BOOTH_API_PREFIX+'/me';
const ADMIN='https://ekodi.kr'+BOOTH_API_PREFIX+'/admin';
const NOW=Date.parse('2026-10-25T12:00:00+09:00');

// Minimal Cloudflare D1 adapter over node:sqlite, executing the real migration.
function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  const statement=(sql,params=[])=>({
    bind:(...args)=>statement(sql,args),
    async first(){return db.prepare(sql).get(...params)??null},
    async all(){return {results:db.prepare(sql).all(...params)}},
    async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}},
  });
  return {raw:db,prepare:sql=>statement(sql)};
}
async function seed(){
  const env={DB:d1()};
  const keys={};
  for(const [i,name] of ['가회원','나회원','다회원'].entries()){
    const key=newBoothKey();keys[name]=key;
    env.DB.raw.prepare('INSERT INTO cgmurrc_booth_members (id,event,name,sort_order,token_hash,token_issued_at,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)')
      .run('m'+i,BOOTH_EVENT,name,i,await hashBoothKey(key),'x','x','x');
  }
  // 나회원 is pre-assigned to 12시 by the secretary.
  env.DB.raw.prepare("INSERT INTO cgmurrc_booth_entries VALUES (?,?,?,?,?,?)").run(BOOTH_EVENT,'m1',2,'assigned','admin','x');
  return {env,keys};
}
const at=now=>({now:()=>now});
const memberGet=key=>new Request(ME,{headers:key?{'x-cgmurrc-booth-key':key}:{}});
const memberPost=(key,body,headers={})=>new Request(ME,{method:'POST',body:JSON.stringify(body),headers:{
  'content-type':'application/json','origin':'https://ekodi.kr','x-ekodi-intake-request':'1','x-cgmurrc-booth-key':key,...headers}});
const adminPost=body=>new Request(ADMIN,{method:'POST',body:JSON.stringify(body),headers:{
  'content-type':'application/json','origin':'https://ekodi.kr','x-ekodi-intake-request':'1'}});
const admin={now:()=>NOW,resolveAuthority:async()=>({ok:true,scope:'tenant',email:'secretary@example.org'})};
const rows=env=>env.DB.raw.prepare('SELECT member_id,slot,status FROM cgmurrc_booth_entries ORDER BY member_id,slot').all().map(r=>({...r}));

test('a personal link shows only its own member and the confirmed board',async()=>{
  const {env,keys}=await seed();
  const res=await handleCgmurrcBooth(memberGet(keys['가회원']),env,at(NOW));
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.member.name,'가회원');
  assert.deepEqual(body.mine,{});
  assert.deepEqual(body.board[2],['나회원']);
  assert.equal(body.writable,true);
  assert.equal(JSON.stringify(body).includes('token'),false);
});

test('missing, malformed and unknown keys are refused',async()=>{
  const {env}=await seed();
  for(const key of [null,'short','x'.repeat(43)]){
    const res=await handleCgmurrcBooth(memberGet(key),env,at(NOW));
    assert.equal(res.status,401,String(key));
  }
});

test("a member's link can never change another member's schedule",async()=>{
  const {env,keys}=await seed();
  const before=rows(env).filter(r=>r.member_id!=='m0');
  // 가회원 asks for 13시: only 가회원's row appears.
  let res=await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:3,action:'request'}),env,at(NOW));
  assert.equal(res.status,200);
  assert.deepEqual(rows(env).filter(r=>r.member_id==='m0'),[{member_id:'m0',slot:3,status:'requested'}]);
  // Naming another member is rejected outright: the API accepts no member id.
  res=await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:2,action:'drop',member_id:'m1'}),env,at(NOW));
  assert.equal(res.status,400);
  // 가회원 trying to drop 12시 acts on 가회원's own (empty) row and is refused; 나회원 keeps 12시.
  res=await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:2,action:'drop'}),env,at(NOW));
  assert.equal(res.status,409);
  assert.deepEqual(rows(env).filter(r=>r.member_id!=='m0'),before);
});

test('members only express wishes; confirmation is not a member action',async()=>{
  const {env,keys}=await seed();
  for(const action of ['assign','confirm','unassign']){
    const res=await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:1,action}),env,at(NOW));
    assert.equal(res.status,400,action);
  }
  let res=await handleCgmurrcBooth(memberPost(keys['나회원'],{slot:2,action:'drop'}),env,at(NOW));
  assert.equal((await res.json()).mine[2],'drop_requested');
  res=await handleCgmurrcBooth(memberPost(keys['나회원'],{slot:2,action:'keep'}),env,at(NOW));
  assert.equal((await res.json()).mine[2],'assigned');
  res=await handleCgmurrcBooth(memberPost(keys['나회원'],{slot:5,action:'request'}),env,at(NOW));
  const body=await res.json();
  assert.equal(body.mine[5],'requested');
  assert.deepEqual(body.board[5],[],'requests stay off the shared board until confirmed');
  res=await handleCgmurrcBooth(memberPost(keys['나회원'],{slot:5,action:'withdraw'}),env,at(NOW));
  assert.equal((await res.json()).mine[5],undefined);
});

test('cross-origin writes, closed windows and expired links fail closed',async()=>{
  const {env,keys}=await seed();
  let res=await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:1,action:'request'},{origin:'https://evil.example'}),env,at(NOW));
  assert.equal(res.status,403);
  res=await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:1,action:'request'}),env,at(MEMBER_WRITES_CLOSE_AT));
  assert.equal(res.status,409);
  res=await handleCgmurrcBooth(memberGet(keys['가회원']),env,at(LINKS_VALID_UNTIL));
  assert.equal(res.status,410);
  assert.deepEqual(rows(env).filter(r=>r.member_id==='m0'),[]);
});

test('the administrator API requires cgmurrc authority',async()=>{
  const {env}=await seed();
  let res=await handleCgmurrcBooth(new Request(ADMIN),env,{now:()=>NOW,resolveAuthority:async()=>({ok:false,status:401})});
  assert.equal(res.status,401);
  res=await handleCgmurrcBooth(new Request(ADMIN),env,{now:()=>NOW,resolveAuthority:async()=>({ok:false,status:403})});
  assert.equal(res.status,403);
  // A member key is not an administrator credential.
  res=await handleCgmurrcBooth(new Request(ADMIN,{headers:{'x-cgmurrc-booth-key':newBoothKey()}}),env,{now:()=>NOW,resolveAuthority:async()=>({ok:false,status:401})});
  assert.equal(res.status,401);
});

test('the secretary confirms or rejects wishes and assigns directly',async()=>{
  const {env,keys}=await seed();
  await handleCgmurrcBooth(memberPost(keys['가회원'],{slot:3,action:'request'}),env,at(NOW));
  await handleCgmurrcBooth(memberPost(keys['다회원'],{slot:4,action:'request'}),env,at(NOW));
  await handleCgmurrcBooth(memberPost(keys['나회원'],{slot:2,action:'drop'}),env,at(NOW));
  let res=await handleCgmurrcBooth(adminPost({action:'confirm',member_id:'m0',slot:3}),env,admin);
  assert.equal(res.status,200);
  res=await handleCgmurrcBooth(adminPost({action:'reject',member_id:'m2',slot:4}),env,admin);
  res=await handleCgmurrcBooth(adminPost({action:'confirm',member_id:'m1',slot:2}),env,admin);
  res=await handleCgmurrcBooth(adminPost({action:'assign',member_id:'m2',slot:7}),env,admin);
  assert.deepEqual(rows(env),[{member_id:'m0',slot:3,status:'assigned'},{member_id:'m2',slot:7,status:'assigned'}]);
  res=await handleCgmurrcBooth(adminPost({action:'confirm',member_id:'m2',slot:7}),env,admin);
  assert.equal(res.status,409,'nothing pending to confirm');
  const audit=env.DB.raw.prepare('SELECT actor,action FROM cgmurrc_booth_audit').all();
  assert.ok(audit.some(a=>a.action==='admin.confirm'&&a.actor==='admin:secretary@example.org'));
  assert.ok(audit.some(a=>a.action==='member.request'&&a.actor==='member'));
});

test('issuing a link returns it once, stores only its hash, and retires the old link',async()=>{
  const {env,keys}=await seed();
  const res=await handleCgmurrcBooth(adminPost({action:'issue_link',member_id:'m0'}),env,admin);
  const body=await res.json();
  assert.ok(body.issued.link.startsWith(BOOTH_LINK_BASE));
  const key=body.issued.link.slice(BOOTH_LINK_BASE.length);
  const stored=env.DB.raw.prepare('SELECT token_hash FROM cgmurrc_booth_members WHERE id=?').get('m0').token_hash;
  assert.equal(stored,await hashBoothKey(key));
  assert.equal(JSON.stringify(env.DB.raw.prepare('SELECT * FROM cgmurrc_booth_members').all()).includes(key),false);
  assert.equal((await handleCgmurrcBooth(memberGet(keys['가회원']),env,at(NOW))).status,401);
  assert.equal((await handleCgmurrcBooth(memberGet(key),env,at(NOW))).status,200);
  // Removing a member kills the link too.
  await handleCgmurrcBooth(adminPost({action:'remove_member',member_id:'m0'}),env,admin);
  assert.equal((await handleCgmurrcBooth(memberGet(key),env,at(NOW))).status,401);
});

test('adding members validates names',async()=>{
  const {env}=await seed();
  assert.equal((await handleCgmurrcBooth(adminPost({action:'add_member',name:'라회원'}),env,admin)).status,200);
  assert.equal((await handleCgmurrcBooth(adminPost({action:'add_member',name:'라회원'}),env,admin)).status,409);
  assert.equal((await handleCgmurrcBooth(adminPost({action:'add_member',name:'<b>'}),env,admin)).status,400);
});

test('the Control API entry routes the booth API',async()=>{
  const {env}=await seed();
  const res=await customerEntryWorker.fetch(new Request(ME),env,{waitUntil(){}});
  assert.equal(res.status,401);
  assert.equal(res.headers.get('x-ekodi-route'),'cgmurrc-booth');
});
