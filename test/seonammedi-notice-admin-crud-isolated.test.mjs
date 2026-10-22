import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../services/independent-board/worker.js';

// Purely local D1 fixture: no Cloudflare credentials, live writes or minted identities.
function isolatedNoticeDb(){
  const records=new Map();
  let nextId=1, writes=0;
  const prepare=sql=>{
    let params=[];
    return {
      bind(...values){params=values;return this},
      async all(){
        assert.match(sql,/^SELECT .* FROM notice_posts WHERE status<>'deleted'/);
        const publicOnly=sql.includes("AND status='published'");
        const hasSearch=sql.includes('title LIKE ? OR body LIKE ?');
        const search=hasSearch?String(params[0]||'').replaceAll('%','').toLowerCase():'';
        const results=[...records.values()]
          .filter(r=>r.status!=='deleted'&&(!publicOnly||r.status==='published'))
          .filter(r=>!search||(r.title+' '+r.body).toLowerCase().includes(search))
          .sort((a,b)=>b.pinned-a.pinned||b.updated_at.localeCompare(a.updated_at)||b.id-a.id);
        return {results:results.map(r=>({...r}))};
      },
      async first(){
        assert.match(sql,/^SELECT id,image_keys FROM notice_posts WHERE id=\?/);
        const row=records.get(Number(params[0]));
        return row&&row.status!=='deleted'?{id:row.id,image_keys:row.image_keys}:null;
      },
      async run(){
        writes++;
        if(sql.startsWith('INSERT INTO notice_posts(')){
          const id=nextId++;
          const [title,body,pinned,image_keys,status,created_by,created_at,updated_at]=params;
          records.set(id,{id,title,body,pinned,image_keys,status,created_by,created_at,updated_at});
          return {meta:{last_row_id:id}};
        }
        if(sql.startsWith('UPDATE notice_posts SET title=')){
          const [title,body,pinned,image_keys,updated_at,id]=params;
          Object.assign(records.get(Number(id)),{title,body,pinned,image_keys,updated_at});
          return {success:true};
        }
        if(sql.startsWith("UPDATE notice_posts SET status='deleted'")){
          const [updated_at,id]=params;
          Object.assign(records.get(Number(id)),{status:'deleted',image_keys:'[]',updated_at});
          return {success:true};
        }
        throw new Error('Unexpected notice D1 write: '+sql);
      }
    };
  };
  return {env:{BOARD_DB:{prepare},BOARD_ID:'seonammedi.notice'},records,get writes(){return writes}};
}
const authorityUrl='https://ekodi.kr/api/seonammedi/admin/me';
const tokenFor={authorized:'isolated-notice-admin',unauthorized:'isolated-google-without-notice-role',expired:'isolated-expired-session'};
function request(origin,path,method='GET',credential='',payload){
  const options={method,headers:{}};
  if(credential)options.headers.authorization='Bearer '+credential;
  if(payload!==undefined){
    options.headers['content-type']='application/json';
    options.body=JSON.stringify(payload);
  }
  return new Request(origin+path,options);
}
async function checkResponse(response,expected){
  assert.equal(response.status,expected);
  return await response.json();
}

for(const mount of ['https://seonammedi.kr/board','https://ekodi.kr/seonammedi/board']){
  test('isolated notice CRUD and permission boundaries: '+mount,async()=>{
    const fixture=isolatedNoticeDb();
    const originalFetch=globalThis.fetch;
    let canonicalChecks=0;
    globalThis.fetch=async (url,init={})=>{
      assert.equal(String(url),authorityUrl,'admin permission is verified only by EKODI Site Core');
      canonicalChecks++;
      const authorization=init.headers?.authorization||'';
      if(authorization==='Bearer '+tokenFor.expired)return Response.json({ok:false},{status:401});
      if(authorization==='Bearer '+tokenFor.unauthorized)
        return Response.json({ok:true,platform:false,permissions:{voices:true,notices:false},email:'denied@example.invalid'});
      assert.equal(authorization,'Bearer '+tokenFor.authorized);
      return Response.json({ok:true,platform:false,permissions:{notices:true},email:'fixture-admin@example.invalid'});
    };
    try{
      const api=path=>mount+path;
      const post={title:'EKODI isolated notice',body:'A reversible local-only proof',pinned:true,images:[]};
      assert.equal((await checkResponse(await worker.fetch(request(mount,'/api/notices'),fixture.env),200)).items.length,0);
      for(const method of ['GET','POST']){
        const res=await worker.fetch(request(mount,'/api/admin/notices',method,'',method==='POST'?post:undefined),fixture.env);
        assert.equal(res.status,403,'anonymous admin access rejected');
      }
      for(const credential of [tokenFor.unauthorized,tokenFor.expired]){
        for(const [method,path,payload] of [['GET','/api/admin/notices'],['POST','/api/admin/notices',post],['PUT','/api/admin/notices/1',post],['DELETE','/api/admin/notices/1']]){
          const response=await worker.fetch(request(mount,path,method,credential,payload),fixture.env);
          assert.equal(response.status,403,'Google identity without notice authority cannot mutate');
        }
      }
      assert.equal(fixture.writes,0,'denied attempts never reached D1 writes');
      const created=await checkResponse(await worker.fetch(request(mount,'/api/admin/notices','POST',tokenFor.authorized,post),fixture.env),201);
      assert.equal(created.ok,true);
      assert.equal(created.id,1);
      const listed=await checkResponse(await worker.fetch(request(mount,'/api/notices'),fixture.env),200);
      assert.equal(listed.items.length,1);
      assert.equal(listed.items[0].title,post.title);
      assert.equal(listed.items[0].pinned,true);
      const adminList=await checkResponse(await worker.fetch(request(mount,'/api/admin/notices','GET',tokenFor.authorized),fixture.env),200);
      assert.equal(adminList.items[0].createdBy,'fixture-admin@example.invalid');
      const changed={title:'EKODI isolated notice updated',body:'Updated with permission checks',pinned:false,images:[]};
      const updated=await checkResponse(await worker.fetch(request(mount,'/api/admin/notices/1','PUT',tokenFor.authorized,changed),fixture.env),200);
      assert.equal(updated.ok,true);
      const found=await checkResponse(await worker.fetch(request(mount,'/api/notices?q=updated'),fixture.env),200);
      assert.equal(found.items.length,1);
      assert.equal(found.items[0].title,changed.title);
      assert.equal(found.items[0].body,changed.body);
      assert.equal(found.items[0].pinned,false);
      const deleted=await checkResponse(await worker.fetch(request(mount,'/api/admin/notices/1','DELETE',tokenFor.authorized),fixture.env),200);
      assert.equal(deleted.ok,true);
      assert.equal(fixture.records.get(1).status,'deleted','delete is a soft delete');
      assert.deepEqual((await checkResponse(await worker.fetch(request(mount,'/api/notices'),fixture.env),200)).items,[]);
      assert.equal((await worker.fetch(request(mount,'/api/admin/notices/1','DELETE',tokenFor.authorized),fixture.env)).status,404);
      assert.equal(fixture.writes,3,'only create, update, delete mutate local D1');
      assert.ok(canonicalChecks>=12,'every attempted administrative action checks central permission');
    }finally{globalThis.fetch=originalFetch}
  });
}
