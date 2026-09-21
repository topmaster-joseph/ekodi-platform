import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../admin-canonical-routes.js',import.meta.url),'utf8');

function routesFor({pathname='/admin/',search='',hash=''}={}){
  const location={
    href:`https://ekodi.kr${pathname}${search}${hash}`,
    hostname:'ekodi.kr',pathname,search,hash,
  };
  const window={location};
  vm.runInNewContext(source,{window,URL,URLSearchParams,Object,Set,String});
  return window.EKODIAdminRoutes;
}

test('Admin roots resolve to command home while child routes remain independent',()=>{
  const routes=routesFor();
  assert.equal(routes.sectionFromPath('/admin/'),'command-home');
  assert.equal(routes.sectionFromPath('/admin/home'),'command-home');
  assert.equal(routes.groups.summary,'platform-overview');
  assert.equal(routes.pathFor('command-home'),'/admin/');
  assert.equal(routes.sectionFromPath('/admin/home/campus'),'campus');
  assert.equal(routes.pathFor('campus'),'/admin/sites/campus');
  assert.equal(routes.sectionFromPath('/admin/services/insurance'),'insurance');
  assert.equal(routes.sectionFromPath('/admin/operations/finance'),'finance');
  assert.equal(routes.pathFor('finance'),'/admin/content/finance');
});

test('legacy query and hash routes override command root for downstream compatibility',()=>{
  let routes=routesFor({pathname:'/admin/',search:'?route=books'});
  assert.equal(routes.sectionFromLocation({
    href:'https://ekodi.kr/admin/?route=books',hostname:'ekodi.kr',pathname:'/admin/',search:'?route=books',hash:''
  }),'books');
  routes=routesFor({pathname:'/admin/',hash:'#insurance'});
  assert.equal(routes.sectionFromLocation({
    href:'https://ekodi.kr/admin/#insurance',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:'#insurance'
  }),'insurance');
});
