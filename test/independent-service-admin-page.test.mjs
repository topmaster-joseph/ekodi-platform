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
