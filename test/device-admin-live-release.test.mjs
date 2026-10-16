import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEVICE_ASSETS, assertDeviceAsset, assertBootstrapRedirect, verifyDeviceAdminLive } from '../scripts/verify-device-admin-live.mjs';

const samples = {
  'device-control-admin.css':'DEVICE-BOOTSTRAP-WIDE-CANONICAL-20261009\n.device-roster-toolbar{display:grid}',
  'device-control-admin.js':'function groupRosterDevices(){}; // EKB-219',
  'ekodi-device-bootstrap.cmd':'@echo off\r\necho ekodi-device-agent-bootstrap- EKB-011'
};

const redirect = () => new Response(null,{status:307,headers:{
  location:'/admin/status/devices',
  'x-ekodi-route':'desktop-bootstrap-canonical',
  'cache-control':'no-store'
}});

test('production bundle must contain the complete actual source, not just a matching old marker',()=>{
  assert.equal(DEVICE_ASSETS.length,3);
  const js=DEVICE_ASSETS.find(x=>x.path==='device-control-admin.js');
  const css=DEVICE_ASSETS.find(x=>x.path==='device-control-admin.css');
  assert.ok(assertDeviceAsset(js,samples[js.path],samples[js.path]+'\n// signed postbuild extension'));
  assert.throws(()=>assertDeviceAsset(js,samples[js.path],'EKB-219 function groupRosterDevices{}'),/version drift/);
  assert.throws(()=>assertDeviceAsset(css,samples[css.path],samples[css.path]+' stale-css'),/version drift/);
  assert.throws(()=>assertDeviceAsset(css,samples[css.path],'.device-roster-toolbar{}'),/missing DEVICE-BOOTSTRAP-WIDE/);
});

test('canonical Bootstrap must never rewrite to a generic admin shell or leak return query',()=>{
  assert.doesNotThrow(()=>assertBootstrapRedirect(redirect()));
  assert.throws(()=>assertBootstrapRedirect(new Response('admin',{status:200})),/HTTP 307/);
  assert.throws(()=>assertBootstrapRedirect(new Response(null,{status:307,headers:{location:'/admin/status/devices?code=leaked','x-ekodi-route':'desktop-bootstrap-canonical','cache-control':'no-store'}})),/Location/);
});

test('guarded release checks root and mirrored bundles and canonical Admin before claiming success',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ekodi-device-live-test-'));
  try{
    for(const [file,data] of Object.entries(samples)) await writeFile(join(dir,file),data,'utf8');
    const seen=[];
    let badFirst=true;
    const fetchImpl=async url=>{
      const path=new URL(url).pathname;
      seen.push(path);
      if(path==='/admin/status/devices') return new Response('admin',{status:200,headers:{'x-ekodi-route':'admin-shell','cache-control':'no-store'}});
      if(path==='/admin/desktop/bootstrap/') return redirect();
      const file=path.replace(/^\/admin\//,'/').slice(1);
      if(badFirst && file==='device-control-admin.css'){badFirst=false;return new Response('updating',{status:503});}
      return Object.hasOwn(samples,file) ? new Response(samples[file]+(file==='device-control-admin.js' ? '\n// governed enhancement':''),{status:200}) : new Response(null,{status:404});
    };
    const log={log:()=>{},error:()=>{}};
    const result=await verifyDeviceAdminLive({origin:'https://ekodi.kr',expectedDir:dir,attempts:2,delayMs:0,fetchImpl,log,sleep:async()=>{}});
    assert.equal(result.ok,true);
    assert.equal(result.attempt,2);
    for(const path of ['/device-control-admin.css','/device-control-admin.js','/ekodi-device-bootstrap.cmd','/admin/device-control-admin.css','/admin/device-control-admin.js','/admin/status/devices','/admin/desktop/bootstrap/']) assert.ok(seen.includes(path),path);
    await assert.rejects(verifyDeviceAdminLive({origin:'http://untrusted.example',expectedDir:dir,attempts:1,fetchImpl,log}),/HTTPS origin/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('post-promotion Cloudflare workflow blocks on real device Admin asset parity',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  assert.match(workflow,/Verify Device Admin production release artifact parity/);
  assert.match(workflow,/node scripts\/verify-device-admin-live\.mjs --origin=https:\/\/ekodi\.kr --expectedDir=dist/);
  assert.ok(workflow.indexOf('Verify Device Admin production release artifact parity') > workflow.indexOf('Candidate at 0%, verify routes, promote and auto-rollback'));
});
