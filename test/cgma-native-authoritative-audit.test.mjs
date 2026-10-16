import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureCgmaNativeGrantSchema, issueCgmaNativeGrant, consumeCgmaNativeGrant } from '../cgma-native-grant-store.js';
import { verifyCgmaNativeAuthoritativeAudit } from '../cgma-native-audit-evidence.js';

const now=1760000000000;
const principalId='admin:cgma-native-owner';
const deviceId='node:cgma-native-device';
const taskId='hyb_123e4567-e89b-42d3-a456-426614174000';
const title='[EKODI native canary] isolated test';
const uid='123e4567-e89b-42d3-a456-426614174000';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  const db={prepare(sql){
    let params=[];
    return {bind(...next){params=next;return this;},
      async run(){const result=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},
      async first(){return sqlite.prepare(sql).get(...params)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...params)};},
    };
  }};
  return {sqlite,db,close(){sqlite.close();}};
}
async function setup(){
  const f=fixture();
  await ensureCgmaNativeGrantSchema(f.db);
  f.sqlite.exec("CREATE TABLE ekodi_board_posts (id INTEGER PRIMARY KEY, board_id TEXT NOT NULL, author_person_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL)");
  f.sqlite.exec("CREATE TABLE ekodi_board_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id TEXT NOT NULL, actor_person_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL)");
  const grant=await issueCgmaNativeGrant(f.db,{principalId,deviceId,boardRole:'owner',nowMs:now,approvedAtMs:now,
    verifiedSession:true,verifiedBoardMembership:true,humanConsent:true,attestedIsolation:true});
  assert.equal(grant.ok,true);
  const payload={origin:'https://ekodi.kr',boardId:'site:cgma:main',confirmed:true,grantRef:grant.grantRef,nonce:grant.nonce};
  assert.equal((await consumeCgmaNativeGrant(f.db,{payload,principalId,deviceId,taskId,nowMs:now+1})).ok,true);
  const receipt={taskId,nonce:grant.nonce,origin:'https://ekodi.kr',boardId:'site:cgma:main',
    ownPostId:123,cleanedUp:true,userBrowserReused:false,clipboardAccessed:false,
    steps:[['health',200],['anonymous-denial',403],['create',201],['read',200],['edit',200],
      ['read-edited',200],['delete',200],['read-deleted',404],['list-hidden',200]]
      .map(([name,httpStatus])=>({name,httpStatus,ok:true})),
    auditEvidenceRefs:['audit_00000001','audit_00000002','audit_00000003']};
  return {...f,grant,receipt};
}
function addPost(s,{postId=123,owner=principalId,postTitle=title,postStatus='deleted',boardId='site:cgma:main'}={}){
  s.sqlite.prepare('INSERT INTO ekodi_board_posts(id,board_id,author_person_id,title,status) VALUES(?,?,?,?,?)')
    .run(postId,boardId,owner,postTitle,postStatus);
}
function addAudits(s,{owner=principalId,postId=123,events=['post.create','post.edit','post.delete'],offset=1000}={}){
  events.forEach((action,i)=>s.sqlite.prepare('INSERT INTO ekodi_board_audit(board_id,actor_person_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)')
    .run('site:cgma:main',owner,action,'post',String(postId),new Date(now+offset+i*1000).toISOString()));
}
const verify=(s,override={})=>verifyCgmaNativeAuthoritativeAudit(s.db,{
  grantRef:s.grant.grantRef,taskId,postId:123,receipt:s.receipt,nowMs:now+20000,...override,
});

test('real D1 rows, original owner, soft-delete and exact three chronological audit events verify',async()=>{
  const s=await setup();
  try {addPost(s);addAudits(s);
    const r=await verify(s);
    assert.equal(r.ok,true);
    assert.equal(r.code,'AUTHORITATIVE_AUDIT_VERIFIED');
    assert.deepEqual(Object.keys(r).sort(),['boardId','code','ok','postId']);
  }finally{s.close();}
});

test('structurally plausible agent receipt cannot forge nonexistent board-side audit',async()=>{
  const s=await setup();
  try {addPost(s);
    assert.equal((await verify(s)).code,'AUTHORITATIVE_AUDIT_INCOMPLETE');
    addAudits(s,{events:['post.create','post.edit']});
    assert.equal((await verify(s)).ok,false);
  }finally{s.close();}
});

test('cannot verify existing user content, another author, nondeleted post or wrong canary title',async()=>{
  for(const replacement of [{owner:'admin:somebody-else'},{postStatus:'published'},{postTitle:'real user content'},{boardId:'site:other:main'}]){
    const s=await setup();
    try{addPost(s,replacement);addAudits(s);
      assert.equal((await verify(s)).code,'AUTHORITATIVE_OWN_TEST_POST_NOT_DELETED');
    }finally{s.close();}
  }
});

test('wrong event action, actor, reference, duplication or time fails closed',async()=>{
  for(const change of ['wrong-action','wrong-actor','wrong-reference','duplicate','late']){
    const s=await setup();
    try{
      addPost(s);
      if(change==='wrong-action')addAudits(s,{events:['post.create','post.create','post.delete']});
      else if(change==='wrong-actor')addAudits(s,{owner:'admin:other'});
      else if(change==='late')addAudits(s,{offset:25000});
      else addAudits(s);
      if(change==='duplicate')addAudits(s,{events:['post.delete']});
      if(change==='wrong-reference')s.receipt.auditEvidenceRefs[1]='audit_00999999';
      const r=await verify(s);
      assert.equal(r.ok,false,change);
    }finally{s.close();}
  }
});

test('expired consumed lease, mismatched task id and nonexistent grant are never accepted',async()=>{
  const s=await setup();
  try{addPost(s);addAudits(s);
    assert.equal((await verify(s,{nowMs:now+180000})).code,'AUTHORITATIVE_LEASE_EXPIRED');
    assert.equal((await verify(s,{grantRef:'cgma_grant_'+uid})).code,'AUTHORITATIVE_GRANT_UNVERIFIED');
    assert.equal((await verify(s,{taskId:'hyb_223e4567-e89b-42d3-a456-426614174000'})).code,'RECEIPT_SCOPE_MISMATCH');
  }finally{s.close();}
});

test('missing board audit tables never become a success',async()=>{
  const s=await setup();
  try{addPost(s);s.sqlite.exec('DROP TABLE ekodi_board_audit');
    assert.equal((await verify(s)).code,'AUTHORITATIVE_AUDIT_UNAVAILABLE');
  }finally{s.close();}
});
