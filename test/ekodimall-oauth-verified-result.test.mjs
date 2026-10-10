import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceAdminScript} from '../workspace-admin-page.js';

const source=readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const begin=source.indexOf('  const channelOAuthConfirmed=');
const end=source.indexOf('  const channelOAuthCopy=',begin);
const connectionCheck=begin>=0&&end>begin
  ?new Function(source.slice(begin,end)+'\nreturn channelOAuthConfirmed;')()
  :null;

test('OAuth callback never counts as success without an active vault connection',()=>{
  assert.equal(typeof connectionCheck,'function');
  assert.equal(connectionCheck({status:'success',provider:'youtube'},[]),false);
  assert.equal(connectionCheck({status:'error',provider:'youtube'},[{provider:'youtube',status:'active'}]),false);
  assert.equal(connectionCheck({status:'success',provider:'youtube'},[{provider:'youtube',status:'revoked'}]),false);
  assert.equal(connectionCheck({status:'success',provider:'youtube'},[{provider:'facebook',status:'active'}]),false);
  assert.equal(connectionCheck({status:'success',provider:'youtube'},[{provider:'youtube',status:'active'}]),true);
});

test('Meta callback can correspond to Facebook or Instagram, never YouTube',()=>{
  assert.equal(connectionCheck({status:'success',provider:'meta'},[{provider:'facebook',status:'active'}]),true);
  assert.equal(connectionCheck({status:'success',provider:'meta'},[{provider:'instagram',status:'active'}]),true);
  assert.equal(connectionCheck({status:'success',provider:'meta'},[{provider:'youtube',status:'active'}]),false);
  assert.equal(connectionCheck({status:'success',provider:'threads'},[{provider:'threads',status:'active'}]),true);
});

test('popup and same-window redirects use verified server records and do not trigger repeat authorization',()=>{
  assert.match(source,/const ledger=await growth\('\/v1\/connections'\)/);
  assert.match(source,/channelOAuthConfirmed\(result,liveConnections\)/);
  assert.match(source,/channelOAuthConfirmed\(notice,connections\)/);
  assert.match(source,/인증 결과 확인 버튼으로 상태를 조회하세요/);
  assert.match(source,/다시 인증할 필요가 없습니다/);
  assert.doesNotMatch(source,/const ok=result\.status==='success',label=/);
  assert.doesNotMatch(source,/const ok=notice\.status==='success',label=/);
  assert.match(source,/subject_type=tenant&subject_key=/);
});

test('generated administrator bundle remains JavaScript-parseable',async()=>{
  const script=await workspaceAdminScript().text();
  assert.match(script,/channelOAuthConfirmed/);
  assert.doesNotThrow(()=>new Function(script));
});
