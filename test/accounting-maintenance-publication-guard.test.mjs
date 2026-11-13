import test from 'node:test';
import assert from 'node:assert/strict';
import { sitePublicationGuard } from '../site-publication-runtime.js';
import worker from '../platform-router-entry-worker.js';
import siteWorker from '../site-worker.js';
import { readFile } from 'node:fs/promises';

const paths=['/ekodibiz/accounting','/ekodichurch/accounting','/ekodimission/accounting','/cgma/accounting','/seonammedi/accounting'];
const control=(status='maintenance',displayType='default',redirectMode='button')=>({
  DB:{prepare(sql){
    let id='';
    const stmt={
      bind(...args){id=String(args[0]||'');return stmt;},
      async first(){return /public_site_controls/i.test(sql)?{
        site_id:id,workspace_id:id,domain:'',public_status:status,
        maintenance_display_type:displayType,maintenance_redirect_url:'https://example.org/maintenance',
        maintenance_title:'준비 중',maintenance_message:'공사 중',redirect_mode:redirectMode,
        updated_at:'2026-11-14T00:00:00.000Z',
      }:null;},
      async all(){return {results:[]}},
      async run(){return {success:true}},
    };
    return stmt;
  }},
  ASSETS:{fetch:async()=>new Response('Not Found',{status:404})},
  ENVIRONMENT:'test',
});
const req=(path,options)=>new Request('https://ekodi.kr'+path,options);
const ctx={waitUntil(){},passThroughOnException(){}};

test('explicit accounting notices bypass maintenance but not private publication state',async()=>{
  const maintenance=control('maintenance');
  const privateEnv=control('private');
  for(const path of paths){
    assert.equal(await sitePublicationGuard(req(path),maintenance),null,path+' maintenance');
    const blocked=await sitePublicationGuard(req(path),privateEnv);
    assert.equal(blocked?.status,404,path+' private');
    assert.equal(blocked?.headers.get('x-ekodi-site-publication'),'private');
  }
});

test('nearby sites and redirecting maintenance pages remain protected',async()=>{
  const maintenance=control('maintenance','url','auto');
  const accounting=await sitePublicationGuard(req('/cgma/accounting'),maintenance);
  assert.equal(accounting,null);
  for(const path of ['/cgma','/cgma/other','/cgma/accounting/archive','/seonammedi/']){
    const blocked=await sitePublicationGuard(req(path),maintenance);
    assert.equal(blocked?.status,302,path);
    assert.equal(blocked.headers.get('x-ekodi-site-publication'),'maintenance');
  }
  assert.equal((await sitePublicationGuard(req('/cgma/accounting',{method:'POST'}),maintenance)),null,'POST is handled by existing method guards, not publication bypass');
});

test('CGMA maintenance accounting routes to exact public summary without simulating Cloudflare HTMLRewriter',async()=>{
  assert.equal(await sitePublicationGuard(req('/cgma/accounting'),control('maintenance')),null);
  const entry=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.ok(entry.indexOf('const publicationGuard=await sitePublicationGuard(request,env)')>0);
  assert.ok(entry.indexOf('isPublicAccountingNoticePath(url.pathname)')>0);
  const response=await siteWorker.fetch(req('/cgma/accounting'),control('maintenance'),ctx);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'public-accounting-notice');
  assert.equal(response.headers.get('x-ekodi-site-publication'),null);
  const body=await response.text();
  for(const marker of ['회계공지','연도 선택','연간 총괄','월별 소계','public-accounting-notice.js'])
    assert.ok(body.includes(marker),marker);
});

test('private CGMA accounting does not expose the public notice body',async()=>{
  const response=await worker.fetch(req('/cgma/accounting'),control('private'),ctx);
  assert.equal(response.status,404);
  assert.equal(response.headers.get('x-ekodi-site-publication'),'private');
  assert.doesNotMatch(await response.text(),/FINANCIAL DISCLOSURE/);
});
