import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleJournalPrivateMedia,validatePrivateWebp } from '../journal-editorial-media-control.js';
const ROOT='https://ekodi.kr/api/journal/editorial/media';
const TOKEN='journal-private-photo-owner-test';
const NORMAL='journal-private-photo-other-test';
const PHOTO='UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoCAAIAAUAgJaACdLoAA5gA/vsFF/4DdfFtMv/nEv9E/YHwIAA=';
const ALPHA='UklGRlYAAABXRUJQVlA4WAoAAAAQAAAAAQAAAQAAQUxQSAUAAAAAgICAgABWUDggKgAAAJABAJ0BKgIAAgABQCAloAJ0ugADmAD++wUX/gN18W0y/+cS/0T9gfAgAA==';
const migrations=['20261103234500_journal_private_editorial_drafts.sql','20261104001000_journal_private_editorial_media.sql'];
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function database(){
  const raw=new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  for(const m of migrations)raw.exec(fs.readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
  raw.exec('CREATE TABLE admins(id INTEGER PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL);');
  raw.exec('CREATE TABLE sessions(token_hash TEXT,admin_id INTEGER,expires_at TEXT);');
  const stmt=(sql,values=[])=>({
    bind:(...v)=>stmt(sql,v),
    async first(){return raw.prepare(sql).get(...values)??null},
    async all(){return {results:raw.prepare(sql).all(...values)}},
    async run(){const r=raw.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}},
  });
  return {raw,prepare:sql=>stmt(sql),async batch(cmds){
    raw.exec('BEGIN IMMEDIATE');try{
      const res=[];for(const command of cmds)res.push(await command.run());
      raw.exec('COMMIT');return res;
    }catch(error){raw.exec('ROLLBACK');throw error}
  }};
}
async function fixture({storage=true,working=true}={}){
  const DB=database(),at=new Date().toISOString(),expiration=new Date(Date.now()+3600e3).toISOString();
  DB.raw.prepare('INSERT INTO admins VALUES(?,?,?)').run(1,'owner@example.org','super_admin');
  DB.raw.prepare('INSERT INTO admins VALUES(?,?,?)').run(2,'other@example.org','admin');
  DB.raw.prepare('INSERT INTO sessions VALUES(?,?,?)').run(await sha(TOKEN),1,expiration);
  DB.raw.prepare('INSERT INTO sessions VALUES(?,?,?)').run(await sha(NORMAL),2,expiration);
  DB.raw.prepare('INSERT INTO journal_private_editorial_drafts(slug,source_revision,packet_json,revision,request_id,updated_by_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('example-photo-draft',null,JSON.stringify({article:{title:'Private',slug:'example-photo-draft'},visibility:'private',state:'review_required'}),1,crypto.randomUUID(),await sha('owner@example.org'),at,at);
  const operations=[];
  const storageBinding={async fetch(req){
    const url=new URL(req.url);
    const name=url.pathname;
    if(req.headers.get('x-ekodi-storage-key')!=='test-only-storage-key')return new Response('no', {status:403});
    if(name.endsWith('/health'))return Response.json({ok:true,canonicalDriveReady:true});
    if(name.endsWith('/records')){
      const body=await req.json();
      operations.push({method:'store',body});
      if(!working)return new Response(JSON.stringify({error:'unavailable'}),{status:503});
      return Response.json({ok:true,file:{id:'test-private-drive-file-1'}});
    }
    if(name.endsWith('/files/test-private-drive-file-1')){
      operations.push({method:'read'});
      return new Response(Buffer.from(PHOTO,'base64'),{headers:{'content-type':'image/webp'}});
    }
    if(name.endsWith('/delete-file')){operations.push({method:'delete'});return Response.json({ok:true})}
    return new Response('missing',{status:404});
  }};
  return {
    env:{DB,ENVIRONMENT:'production',STORAGE:storage?storageBinding:undefined,
      EKODI_STORAGE_GATEWAY_KEY:storage?'test-only-storage-key':undefined,
      ALLOWED_ORIGINS:'https://ekodi.kr'},
    operations
  };
}
async function call(env,method='GET',body=null,{token=TOKEN,origin='https://ekodi.kr',path='',query='?slug=example-photo-draft'}={}){
  const headers={...(token?{authorization:'Bearer '+token}:{}),...(origin?{origin}:{})};
  if(body)headers['content-type']='application/json';
  return handleJournalPrivateMedia(new Request(ROOT+path+(path?'':query),{
    method,headers,...(body?{body:JSON.stringify(body)}:{})
  }),env);
}
const upload=(override={})=>({
  draftSlug:'example-photo-draft',alt:'공동체의 현장 사진',credit:'EKODI',caption:'현장사진',
  rightsAttested:true,contentBase64:PHOTO,...override
});
const jsonOf=async response=>({status:response.status,body:await response.json()});

test('WebP validator accepts stripped actual WebP and rejects metadata, dimension bombs and polyglots',()=>{
  assert.equal(validatePrivateWebp(Buffer.from(PHOTO,'base64')),true);
  assert.equal(validatePrivateWebp(Buffer.from(ALPHA,'base64')),true);
  const exif=Buffer.from(PHOTO,'base64');
  exif.write('EXIF',12);
  assert.equal(validatePrivateWebp(exif),false);
  const altered=Buffer.from(PHOTO,'base64');
  altered.writeUInt32LE(10,4);
  assert.equal(validatePrivateWebp(altered),false);
  const tooWide=Buffer.from(PHOTO,'base64');
  tooWide.writeUInt16LE(16383,26);
  assert.equal(validatePrivateWebp(tooWide),false);
  assert.equal(validatePrivateWebp(Buffer.from('not an image')),false);
});

test('only central super-admin may list, upload or read private photographic material',async()=>{
  const {env,operations}=await fixture();
  assert.equal((await call(env,'GET',null,{token:''})).status,403);
  assert.equal((await call(env,'GET',null,{token:NORMAL})).status,403);
  assert.equal((await call(env,'POST',upload(),{token:NORMAL})).status,403);
  const status=await jsonOf(await call(env));
  assert.equal(status.status,200);
  assert.equal(status.body.uploadReady,true);
  assert.deepEqual(status.body.media,[]);
  assert.equal(operations.length,0);
});

test('authenticated upload goes only to internal canonical storage, persists pending metadata and audit',async()=>{
  const {env,operations}=await fixture();
  const saved=await jsonOf(await call(env,'POST',upload()));
  assert.equal(saved.status,201,JSON.stringify(saved.body));
  assert.equal(saved.body.media.rightsStatus,'pending');
  assert.equal(saved.body.media.previewPath.startsWith('/api/journal/editorial/media/'),true);
  assert.equal(saved.body.media.drive_file_id,undefined);
  assert.equal(operations.length,1);
  assert.equal(operations[0].body.serviceId,'journal');
  assert.equal(operations[0].body.storageRoute,'media');
  assert.equal(operations[0].body.retentionClass,'operational');
  assert.equal(operations[0].body.mimeType,'image/webp');
  assert.equal(operations[0].body.contentBase64,PHOTO);
  const row=env.DB.raw.prepare('SELECT * FROM journal_private_editorial_media').get();
  assert.equal(row.rights_status,'pending');
  assert.equal(row.drive_file_id,'test-private-drive-file-1');
  assert.equal(row.actor_hash.length,64);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS total FROM journal_private_editorial_media_audit').get().total,1);
  const list=await jsonOf(await call(env));
  assert.equal(list.body.media.length,1);
  assert.equal(list.body.media[0].id,saved.body.media.id);
  const photo=await call(env,'GET',null,{path:'/'+saved.body.media.id+'/file'});
  assert.equal(photo.status,200);
  assert.equal(photo.headers.get('content-type'),'image/webp');
  assert.match(photo.headers.get('cache-control'),/no-store/);
  assert.match(photo.headers.get('x-robots-tag'),/noindex/);
  assert.ok((await photo.arrayBuffer()).byteLength>30);
  assert.equal((await call(env,'GET',null,{path:'/'+saved.body.media.id+'/file',token:NORMAL})).status,403);
});

test('reject other origins, missing consent, untrusted bytes, external files and unsaved draft',async()=>{
  const {env,operations}=await fixture();
  for(const [body,options,code] of [
    [upload(),{origin:'https://evil.example'},403],
    [upload(),{origin:''},403],
    [upload({rightsAttested:false}),{},400],
    [upload({alt:'bad'}),{},400],
    [upload({credit:''}),{},400],
    [upload({draftSlug:'unknown-draft'}),{},409],
    [upload({contentBase64:btoa('<svg/onload=alert(1)>')}),{},415],
    [upload({contentBase64:'data:image/webp;base64,'+PHOTO}),{},415],
  ]){
    const res=await call(env,'POST',body,options);
    assert.equal(res.status,code,JSON.stringify(await res.json()));
  }
  assert.equal(operations.length,0);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS total FROM journal_private_editorial_media').get().total,0);
});

test('missing canonical storage binding or failed Drive insert closes upload without media approval',async()=>{
  const unavailable=await fixture({storage:false});
  const view=await jsonOf(await call(unavailable.env));
  assert.equal(view.status,200);
  assert.equal(view.body.uploadReady,false);
  assert.equal((await call(unavailable.env,'POST',upload())).status,503);
  const down=await fixture({working:false});
  const fail=await jsonOf(await call(down.env,'POST',upload()));
  assert.equal(fail.status,503);
  assert.equal(down.env.DB.raw.prepare('SELECT count(*) AS total FROM journal_private_editorial_media').get().total,0);
});

test('server ignores public publishing claims; no public journal route or file id appears in response',async()=>{
  const {env}=await fixture();
  const saved=await jsonOf(await call(env,'POST',upload({rightsStatus:'verified',publishApproved:true,visibility:'public'})));
  assert.equal(saved.status,201);
  assert.equal(saved.body.media.rightsStatus,'pending');
  const body=JSON.stringify(saved.body);
  assert.doesNotMatch(body,/drive_file_id|test-private-drive-file-1|journal\/media\//);
});


test('database-enforced per-article photo cap remains atomic under concurrency',async()=>{
  const {env}=await fixture();
  const row=env.DB.raw.prepare('INSERT INTO journal_private_editorial_media(id,draft_slug,drive_file_id,mime_type,byte_size,alt,caption,credit,actor_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const actor=await sha('owner@example.org');
  const now=new Date().toISOString();
  for(let n=0;n<24;n++)row.run(crypto.randomUUID(),'example-photo-draft','private-drive-file-'+n,'image/webp',100,'조용한 현장 사진','','EKODI',actor,now,now);
  assert.throws(()=>row.run(crypto.randomUUID(),'example-photo-draft','overflow','image/webp',100,'조용한 현장 사진','','EKODI',actor,now,now),/journal_media_limit/);
  assert.equal((await call(env,'POST',upload())).status,429);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS total FROM journal_private_editorial_media').get().total,24);
});

test('development and unconfigured canonical Drive never falsely report upload readiness',async()=>{
  const missing=await fixture({storage:false});
  assert.equal((await jsonOf(await call(missing.env))).body.uploadReady,false);
  const staging=await fixture();
  staging.env.ENVIRONMENT='staging';
  assert.equal((await jsonOf(await call(staging.env))).body.uploadReady,false);
  assert.equal((await call(staging.env,'POST',upload())).status,503);
  assert.equal(staging.operations.length,0);
});
