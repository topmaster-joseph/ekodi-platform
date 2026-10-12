import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceAdminScript} from '../workspace-admin-page.js';
import { youtubeDataApiDisabledProject, youtubeDataApiCloudUrl } from '../youtube-data-api-readiness.js';

const source=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const account={id:12,provider:'youtube',status:'active',providerAccountId:'seller@example.com',loginHint:'seller@example.com',metadata:{oauth:{connectionIds:[]}}};
const authorized={id:8,provider:'youtube',status:'active',external_id:'UC-test',metadata:{registryConnectionId:'12',authorizedEmail:'seller@example.com'}};

function renderAccountRows(accounts,connections){
  const start=source.indexOf('const oauthLinkedForAccount=account=>');
  const end=source.indexOf('const localChannelSiteId=',start);
  assert.ok(start>=0&&end>start,'verified account predicate must be defined before account rows');
  const statement=source.slice(start,end);
  const render=new Function('registeredAccounts','connections','channelProviderFromRegistry','CHANNEL_TARGETS','CHANNEL_AUTH_PATHS','platform','accountStatusLabel','ae','youtubeDataApiDisabledProject','youtubeDataApiCloudUrl',statement+'\nreturn accountRows;');
  return render(accounts,connections,row=>row.provider,new Map([['youtube',{id:'youtube',label:'YouTube',healthKey:'youtubeConfigured',authAdapter:'youtube',automationAdapter:true,formats:[]}]]),{youtube:'/v1/connect/youtube/start'},{youtubeConfigured:true},status=>status,value=>String(value??''),youtubeDataApiDisabledProject,youtubeDataApiCloudUrl);
}

test('active registry account without live OAuth does not claim signed-in connectivity',()=>{
  const html=renderAccountRows([account],[]);
  assert.match(html,/계정 등록됨 · OAuth 확인 필요/);
  assert.match(html,/data-account-auth='12'/);
  assert.doesNotMatch(html,/관리자 로그인으로 사용/);
});

test('active OAuth must belong to the same registered account, not just provider',()=>{
  const html=renderAccountRows([account],[{...authorized,metadata:{registryConnectionId:'other-account',authorizedEmail:'someone-else@example.com'}}]);
  assert.match(html,/계정 등록됨 · OAuth 확인 필요/);
  assert.doesNotMatch(html,/관리자 로그인으로 사용/);
});

test('verified matching OAuth suppresses redundant reconnect on the account row',()=>{
  const html=renderAccountRows([account],[authorized]);
  assert.match(html,/OAuth 연결 확인됨/);
  assert.match(html,/관리자 로그인으로 사용/);
  assert.doesNotMatch(html,/data-account-auth=/);
});

test('revoked OAuth never appears active and manual reconnect remains available',()=>{
  const html=renderAccountRows([{...account,status:'reconnect_required'}],[{...authorized,status:'revoked'}]);
  assert.match(html,/재연결/);
  assert.match(html,/data-account-auth='12'/);
  assert.doesNotMatch(html,/관리자 로그인으로 사용/);
});

test('generated administrator JS remains parseable',async()=>{
  const script=await workspaceAdminScript().text();
  assert.doesNotThrow(()=>new Function(script));
});

test('same Google email belonging to unrelated registry must not mark the account OAuth-linked',()=>{
  const cross={...authorized,metadata:{registryConnectionId:'other',authorizedEmail:account.loginHint}};
  const html=renderAccountRows([account],[cross]);
  assert.match(html,/OAuth 확인 필요/);
  assert.doesNotMatch(html,/관리자 로그인으로 사용/);
});

test('Google project-wide YouTube API disablement shows setup instead of misleading account re-login',()=>{
  const googleError='YouTube Data API v3 has not been used in project 483044030492 before or it is disabled. Enable it by visiting a Google Cloud API link';
  const html=renderAccountRows([ {...account,id:12,status:'error',lastError:googleError}, {...account,id:15,status:'error',lastError:googleError} ],[]);
  assert.match(html,/YouTube API 설정 필요/);
  assert.match(html,/프로젝트 설정을 먼저 확인/);
  assert.match(html,/project=483044030492/);
  assert.match(html,/설정 후 연결 재시도/);
  assert.equal((html.match(/YouTube API 사용 설정/g)||[]).length,2);
  assert.doesNotMatch(html,/has not been used in project/);
  assert.doesNotMatch(html,/>재연결</);
});
test('non-platform OAuth failure continues to show a manual reconnect option',()=>{
  const html=renderAccountRows([{...account,status:'reconnect_required',lastError:'GOOGLE_OAUTH_ACCESS_DENIED'}],[]);
  assert.match(html,/>재연결</);
  assert.doesNotMatch(html,/YouTube API 사용 설정/);
});
