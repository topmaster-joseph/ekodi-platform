import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attestGitHubInstallationToken,isVerifiedGitHubInstallationProof
} from '../github-api-installation-proof.js';

const NOW=Date.parse('2026-10-30T12:00:00Z');
const ID=54321, APP=76, TOKEN='internal-unit-test-installation-token';
const env=DB=>({DB,EKODI_GITHUB_BUDGET_ADMISSION_ENABLED:'true',
  EKODI_GITHUB_APP_ID:String(APP),EKODI_GITHUB_INSTALLATION_ID:String(ID)});
const rateHeaders=new Headers({
  'x-ratelimit-resource':'core','x-ratelimit-limit':'5000',
  'x-ratelimit-remaining':'4722',
  'x-ratelimit-reset':String(Math.floor((NOW+3600000)/1000))
});
const response=(body,headers=new Headers())=>({ok:true,status:200,
  headers,json:async()=>body});
const DB=(writes=[])=>({prepare(sql){return {bind(...values){
  writes.push({sql,values});return {run:async()=>({meta:{changes:1}})};
}};}});
function transport({badId=false,badApp=false,badRepo=false,missingRate=false,permission=false,requests=[]}={}){
  return async(url,options)=>{
    requests.push({url,method:options.method,redirect:options.redirect});
    if(permission)return {ok:false,status:403};
    if(url.endsWith('/installation'))
      return response({id:badId?22:ID,app_id:badApp?88:APP});
    return response({full_name:badRepo?'wrong/repo':'topmaster-joseph/ekodi-platform'},
      missingRate?new Headers():rateHeaders);
  };
}

test('disabled feature avoids any network or database I/O',async()=>{
  let calls=0;const settings=env({prepare(){calls++;throw Error('unexpected');}});
  delete settings.EKODI_GITHUB_BUDGET_ADMISSION_ENABLED;
  const result=await attestGitHubInstallationToken(settings,{
    installationToken:TOKEN,nowMs:NOW,
    fetchImpl:async()=>{calls++;throw Error('unexpected');}
  });
  assert.equal(result.verified,false);assert.equal(result.reason,'not_connected');
  assert.equal(calls,0);
});
test('real HTTPS installation and repository evidence creates only brief opaque proof',async()=>{
  const requests=[],writes=[];
  const outcome=await attestGitHubInstallationToken(env(DB(writes)),{
    installationToken:TOKEN,nowMs:NOW,fetchImpl:transport({requests})
  });
  assert.equal(outcome.verified,true);
  assert.deepEqual(requests.map(x=>x.url),[
    'https://api.github.com/installation',
    'https://api.github.com/repos/topmaster-joseph/ekodi-platform'
  ]);
  assert.ok(requests.every(x=>x.method==='GET'&&x.redirect==='error'));
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].values.slice(0,4),[ID,'core',5000,4722]);
  assert.equal(isVerifiedGitHubInstallationProof(outcome.context,{
    installationId:ID,appId:APP,nowMs:NOW+24999}),true);
  assert.equal(isVerifiedGitHubInstallationProof(outcome.context,{
    installationId:ID,appId:APP,nowMs:NOW+25000}),false);
  assert.equal(isVerifiedGitHubInstallationProof({...outcome.context},{
    installationId:ID,appId:APP,nowMs:NOW}),false);
  assert.equal(isVerifiedGitHubInstallationProof({
    source:'ekodi-orchestrator',verifiedInstallationToken:true,
    installationId:ID,appId:APP
  },{installationId:ID,appId:APP,nowMs:NOW}),false);
  assert.doesNotMatch(JSON.stringify(writes),/internal-unit-test-installation-token/);
});
test('wrong installation, App, repository, permissions or real quota reject proof',async()=>{
  for(const option of [{badId:true},{badApp:true},{badRepo:true},
    {missingRate:true},{permission:true}]){
    const writes=[];const result=await attestGitHubInstallationToken(env(DB(writes)),{
      installationToken:TOKEN,nowMs:NOW,fetchImpl:transport(option)
    });
    assert.equal(result.verified,false,JSON.stringify(option));
    assert.equal(result.context,null);
    assert.equal(writes.length,0);
  }
});
test('missing App configuration, missing token and broken D1 reject',async()=>{
  const settings=env(DB());delete settings.EKODI_GITHUB_APP_ID;
  assert.equal((await attestGitHubInstallationToken(settings,{
    installationToken:TOKEN,nowMs:NOW
  })).verified,false);
  assert.equal((await attestGitHubInstallationToken(env(DB()),{
    installationToken:'',nowMs:NOW
  })).verified,false);
  const result=await attestGitHubInstallationToken(env({
    prepare(){throw Error('storage offline');}
  }),{installationToken:TOKEN,nowMs:NOW,fetchImpl:transport()});
  assert.equal(result.verified,false);
  assert.equal(result.reason,'verification_unavailable');
});
