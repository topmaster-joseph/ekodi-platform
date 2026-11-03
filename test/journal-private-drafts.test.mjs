import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createJournalReviewPacket } from '../journal-editorial-packet.js';
import { getPost } from '../journal-content.js';
import { handleJournalEditorialDrafts } from '../journal-editorial-control.js';

const ROOT='https://ekodi.kr/api/journal/editorial/drafts';
const SUPER='journal-editorial-super-admin-token';
const EDITOR='journal-editorial-ordinary-admin-token';
const migration=fs.readFileSync(new URL('../migrations/20261103234500_journal_private_editorial_drafts.sql',import.meta.url),'utf8');
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');

function dbAdapter(){
  const raw=new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=ON;');
  raw.exec(migration);
  raw.exec('CREATE TABLE admins(id INTEGER PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL);');
  raw.exec('CREATE TABLE sessions(token_hash TEXT,admin_id INTEGER,expires_at TEXT);');
  const statement=(sql,values=[])=>({
    bind:(...v)=>statement(sql,v),
    async first(){return raw.prepare(sql).get(...values)??null},
    async all(){return {results:raw.prepare(sql).all(...values)}},
    async run(){const r=raw.prepare(sql).run(...values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}},
  });
  return {
    raw,
    prepare:sql=>statement(sql),
    async batch(commands){
      raw.exec('BEGIN IMMEDIATE');
      try{
        const output=[];
        for(const command of commands)output.push(await command.run());
        raw.exec('COMMIT');
        return output;
      }catch(e){raw.exec('ROLLBACK');throw e}
    },
  };
}

async function env(){
  const DB=dbAdapter(),now=new Date(Date.now()+3600_000).toISOString();
  DB.raw.prepare('INSERT INTO admins(id,email,role) VALUES(?,?,?)').run(1,'owner@example.org','super_admin');
  DB.raw.prepare('INSERT INTO admins(id,email,role) VALUES(?,?,?)').run(2,'operator@example.org','admin');
  DB.raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').run(await sha(SUPER),1,now);
  DB.raw.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').run(await sha(EDITOR),2,now);
  return {DB,ALLOWED_ORIGINS:'https://ekodi.kr'};
}
const source = {
  slug:'new-field-journal',
  title:'현장에서 함께 기록합니다',
  excerpt:'서로의 경험과 배움을 모아 다음 사람에게 전합니다.',
  body:'## 현장의 목소리\n\n일상의 사건을 기록하고 나눕니다.',
  photoSrc:'/journal/media/field/meeting.webp',
  photoAlt:'나눔 시간에 둘러앉은 사람들',
  photoCaption:'현장 기록',
  photoCredit:'EKODI',
};
function packet(fields=source){
  return createJournalReviewPacket(null,fields);
}
const call=async(environment,method='GET',body=null,token=SUPER,{origin='https://ekodi.kr',path=''}={})=>{
  const headers={...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{})};
  if(body)headers['content-type']='application/json';
  const request=new Request(ROOT+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  return handleJournalEditorialDrafts(request,environment);
};
const result=async(response)=>({status:response.status,data:await response.json(),headers:response.headers});

test('authenticated private draft list is empty and never cacheable',async()=>{
  const e=await env();
  const r=await result(await call(e));
  assert.equal(r.status,200);
  assert.deepEqual(r.data.drafts,[]);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.match(r.headers.get('x-robots-tag'),/noindex/);
});

test('unknown and non-super-admin sessions cannot read or save private drafts',async()=>{
  const e=await env();
  assert.equal((await call(e,'GET',null,'')).status,403);
  assert.equal((await call(e,'GET',null,'bad-token')).status,403);
  assert.equal((await call(e,'GET',null,EDITOR)).status,403);
  assert.equal((await call(e,'POST',{packet:packet(),expectedRevision:0},EDITOR)).status,403);
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM journal_private_editorial_drafts').get().n,0);
});

test('save never approves publication or photo rights even if input forges approvals',async()=>{
  const e=await env();
  const forged=packet();
  forged.visibility='public';
  forged.publishApproved=true;
  forged.state='published';
  forged.article.coverPhoto.rightsStatus='verified';
  const r=await result(await call(e,'POST',{packet:forged,sourceRevision:null,expectedRevision:0}));
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.draft.revision,1);
  assert.equal(r.data.draft.packet.publishApproved,false);
  assert.equal(r.data.draft.packet.visibility,'private');
  assert.equal(r.data.draft.packet.state,'review_required');
  assert.equal(r.data.draft.packet.article.coverPhoto.rightsStatus,'pending');
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM journal_private_editorial_audit').get().n,1);
  assert.equal(e.DB.raw.prepare('SELECT length(actor_hash) AS n FROM journal_private_editorial_audit').get().n,64);
  const read=await result(await call(e,'GET',null,SUPER,{path:'/new-field-journal'}));
  assert.equal(read.status,200);
  assert.equal(read.data.draft.packet.article.title,source.title);
});

test('optimistic concurrency prevents overwrites and false audit events',async()=>{
  const e=await env();
  assert.equal((await call(e,'POST',{packet:packet(),sourceRevision:null,expectedRevision:0})).status,200);
  const revised=packet({...source,title:'기록을 보완한 두 번째 원고'});
  const update=await result(await call(e,'POST',{packet:revised,sourceRevision:null,expectedRevision:1}));
  assert.equal(update.status,200);
  assert.equal(update.data.draft.revision,2);
  const stale=await result(await call(e,'POST',{packet:packet(),sourceRevision:null,expectedRevision:1}));
  assert.equal(stale.status,409);
  assert.equal(stale.data.error,'draft_revision_conflict');
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM journal_private_editorial_audit').get().n,2);
  assert.equal(e.DB.raw.prepare('SELECT revision FROM journal_private_editorial_drafts').get().revision,2);
  const list=await result(await call(e));
  assert.equal(list.data.drafts[0].title,'기록을 보완한 두 번째 원고');
});

test('write requests reject external origins, invalid payloads, and wrong source revisions',async()=>{
  const e=await env(),valid={packet:packet(),sourceRevision:null,expectedRevision:0};
  assert.equal((await call(e,'POST',valid,SUPER,{origin:'https://evil.example'})).status,403);
  assert.equal((await call(e,'POST',{...valid,expectedRevision:-1})).status,400);
  const wrong=packet();wrong.article.slug='../sensitive';
  assert.equal((await call(e,'POST',{packet:wrong,expectedRevision:0})).status,400);
  assert.equal((await call(e,'POST',{...valid,sourceRevision:'forged'})).status,409);
  assert.equal((await call(e,'POST',valid,SUPER,{origin:''})).status,403);
  assert.equal((await call(e,'GET',null,SUPER,{path:'/invalid%2Fslug'})).status,400);
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM journal_private_editorial_drafts').get().n,0);
});

test('unprovisioned schema fails closed, never exposes raw SQL',async()=>{
  const e=await env();
  e.DB.raw.exec('DROP TABLE journal_private_editorial_drafts');
  const r=await result(await call(e));
  assert.equal(r.status,503);
  assert.equal(r.data.error,'draft_storage_unavailable');
  assert.doesNotMatch(JSON.stringify(r.data),/sqlite|table|SELECT/i);
});

test('non-journal routes are not intercepted and unsupported methods do not mutate',async()=>{
  const e=await env();
  const passthrough=await handleJournalEditorialDrafts(new Request('https://ekodi.kr/api/books'),e);
  assert.equal(passthrough,null);
  const wrong=await call(e,'DELETE',null,SUPER,{path:'/new-field-journal'});
  assert.equal(wrong.status,405);
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM journal_private_editorial_drafts').get().n,0);
});

test('published article edits require current Git-reviewed source revision',async()=>{
  const e=await env();
  const published=getPost('beginning-ekodi-journal');
  assert.ok(published);
  const updated=createJournalReviewPacket(published,{
    slug:published.slug,title:'새로운 저널의 방향을 기록합니다',
    excerpt:'기존 공개 원고를 바탕으로 새 검토 초안을 준비합니다.',
    body:'## 본문 검토\n\n새로운 관점을 담되 승인 전에는 공개하지 않습니다.',
  });
  const rejected=await result(await call(e,'POST',{packet:updated,sourceRevision:'stale-version',expectedRevision:0}));
  assert.equal(rejected.status,409);
  assert.equal(rejected.data.error,'source_revision_conflict');
  const saved=await result(await call(e,'POST',{packet:updated,sourceRevision:published.updatedAt||null,expectedRevision:0}));
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal(saved.data.draft.packet.visibility,'private');
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM journal_private_editorial_audit').get().n,1);
});
