import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeAuditComment} from '../scripts/report-seonammedi-native-audit.mjs';

test('owner-triggered guest Chromium reporter keeps strictly allowlisted signals',()=>{
 const raw='user-private@sample.invalid?access_token=supersecret';
 const report={passed:false,results:[
  {origin:'canonical',device:'desktop',path:'/board/voices',ok:false,
   reason:'guest_compose_original_return_lost: '+raw,
   composeReturnPathMatches:false,composePurposeMatches:true,manageReturnMatches:true,
   loginNavigations:[raw],url:'https://example.invalid/?access_token=supersecret'},
  {origin:raw,device:raw,path:'/board/voices?token='+raw,ok:false,reason:raw}
 ]};
 const summary=safeAuditComment(report,'38858529972/secret');
 assert.match(summary,/Cases: 0\/2 passed/);
 assert.match(summary,/guest_compose_original_return_lost/);
 assert.match(summary,/composeReturnPathMatches=false, composePurposeMatches=true/);
 assert.match(summary,/unknown \/ unknown \/ unknown : other/);
 assert.doesNotMatch(summary,/user-private|supersecret|access_token|sample\.invalid|example\.invalid/);
 assert.match(summary,/Authenticated Google write\/admin CRUD: NOT TESTED/);
});

test('green report does not claim signed-in evidence',()=>{
 const s=safeAuditComment({passed:true,results:[{ok:true}]},'123');
 assert.match(s,/Result: PASS/);
 assert.match(s,/Cases: 1\/1 passed/);
 assert.match(s,/Authenticated Google write\/admin CRUD: NOT TESTED/);
});

test('report step is owner-scoped to a closed PR and leaves pull-request checks read-only',()=>{
 const yml=readFileSync(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8');
 assert.ok(yml.includes("github.event.comment.user.login == github.repository_owner"));
 assert.ok(yml.includes("github.event.issue.state == 'closed'"));
 assert.ok(yml.includes("github.event.comment.body == 'EKODI-SEONAM-NATIVE-AUDIT:RUN'"));
 assert.match(yml,/native-public-guest-audit:\n    permissions:\n      contents: read\n      issues: write/);
 assert.match(yml,/continue-on-error: true/);
 assert.match(yml,/run: node scripts\/report-seonammedi-native-audit.mjs/);
});
