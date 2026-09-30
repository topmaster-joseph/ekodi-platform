import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalSiteSubject, handleSiteChromeApi, listSiteChromeSettings } from '../site-chrome-runtime.js';

function publicDb(){
  return {
    prepare(sql){
      return {
        bind(){
          return {
            async first(){
              if(sql.includes('FROM customer_tenants')) return {id:1,slug:'cgma',name:'청계면상인회',domain:'cgma.or.kr',status:'active'};
              if(sql.includes('FROM site_chrome_settings')) return null;
              return null;
            }
          };
        }
      };
    }
  };
}

test('CGMA aliases resolve to one 청계면상인회 identity',()=>{
  assert.equal(canonicalSiteSubject('cgma'),'cgma');
  assert.equal(canonicalSiteSubject('cheonggye'),'cgma');
  assert.equal(canonicalSiteSubject('cheonggye-merchant-association'),'cgma');
});

test('public site chrome omits administrator identity and legacy domain metadata',async()=>{
  const request=new Request('https://workspace-api.ekodi.kr/v1/site-chrome/public?subject_key=cheonggye');
  const response=await handleSiteChromeApi(request,{DB:publicDb()});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.subjectKey,'cgma');
  assert.equal(body.siteName,'청계면상인회');
  assert.equal(body.abbreviation,'CGMA');
  assert.equal(body.canonicalPath,'/cgma');
  assert.equal(body.updatedBy,undefined);
  assert.equal(body.publicDomain,undefined);
  assert.equal(body.source,'default');
  assert.equal(body.footer.operator.name,'에코디비즈');
});

test('private site chrome endpoint requires authentication',async()=>{
  const request=new Request('https://workspace-api.ekodi.kr/v1/site-chrome?subject_key=cgma');
  const response=await handleSiteChromeApi(request,{DB:publicDb()});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{error:'AUTH_REQUIRED'});
});

test('site chrome listing deduplicates technical Cheonggye aliases',async()=>{
  const DB={prepare(){return{async all(){return{results:[
    {id:1,slug:'cgma',name:'청계면상인회',domain:'cgma.or.kr',status:'active',header_json:null,footer_json:null,version:null,updated_by:null,updated_at:null},
    {id:2,slug:'cheonggye',name:'청계면상인회',domain:'',status:'active',header_json:null,footer_json:null,version:null,updated_by:null,updated_at:null},
  ]}}}}};
  const sites=await listSiteChromeSettings({DB});
  assert.equal(sites.length,1);
  assert.equal(sites[0].subjectKey,'cgma');
  assert.equal(sites[0].siteName,'청계면상인회');
  assert.equal(sites[0].abbreviation,'CGMA');
});

test('central Admin ships site chrome as an on-demand asset',async()=>{
  const [build,shell,layout,postbuild,siteChromeAdmin]=await Promise.all([
    readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),
    readFile(new URL('../admin-authenticated-shell.js',import.meta.url),'utf8'),
    readFile(new URL('../admin-menu-layout.js',import.meta.url),'utf8'),
    readFile(new URL('../scripts/admin-performance-postbuild.mjs',import.meta.url),'utf8'),
    readFile(new URL('../admin-site-chrome.js',import.meta.url),'utf8'),
  ]);
  assert.match(build,/admin-site-chrome\.js/);
  assert.doesNotMatch(shell,/deferredPostAuthScripts[^\n]*admin-site-chrome\.js/);
  assert.match(layout,/import\('\.\/admin-site-chrome\.js'\)/);
  assert.match(postbuild,/admin-site-chrome\.js/);
  assert.match(siteChromeAdmin,/ekodi-admin-section-changed/);
  assert.match(siteChromeAdmin,/detail:\{section:SECTION\}/);
});
