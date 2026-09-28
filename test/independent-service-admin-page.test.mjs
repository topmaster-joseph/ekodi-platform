import test from 'node:test';
import assert from 'node:assert/strict';
import { independentServiceAdminDescriptor, independentServiceAdminPage } from '../independent-service-admin-page.js';

test('generic EKODI service admins own canonical service /admin routes',async()=>{
  for(const [path,id] of [['/books/admin','books'],['/publishing/admin/settings','publishing'],['/social/admin','social'],['/cloud/admin/connections','cloud'],['/media/admin','media']]){
    const d=independentServiceAdminDescriptor(path);assert.equal(d?.id,id,path);
    const response=independentServiceAdminPage(path);assert.equal(response?.status,200,path);assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
test('dedicated admins remain outside generic service admin fallback',()=>{
  for(const path of ['/ekodimall/admin','/ekodimission/admin','/ekodibiz/admin','/invest/admin','/mail/admin'])assert.equal(independentServiceAdminDescriptor(path),null,path);
});


test('independent site admins are task-specific and automation-ready',()=>{
  for(const [path,id] of [['/books/admin','books'],['/ekodilab/admin','lab'],['/education/admin','education'],['/work/admin','work'],['/media/admin','media']]){
    const d=independentServiceAdminDescriptor(path);assert.equal(d?.id,id);assert.ok(d.menu.some(([key])=>key==='automation'),path);assert.ok(d.menu.length>=6,path);
    const response=independentServiceAdminPage(path);return response.text().then(html=>{assert.match(html,/오늘 운영|자동운영/);assert.match(html,/운영상태/);assert.match(html,/최고관리자 사이트관리/);});
  }
});
