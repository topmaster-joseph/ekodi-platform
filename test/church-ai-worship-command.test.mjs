import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {churchPastorAdminScript} from '../church-pastor-admin-page.js';
const source=await readFile(new URL('../church-pastor-admin-page.js',import.meta.url),'utf8');
test('AI command appears only in the writable Sunday ministry and never on people or finance modules',async()=>{
 const start=source.indexOf('  async function worship(){'),people=source.indexOf('  async function people(){'),care=source.indexOf('  async function care(){');
 assert.ok(start>people&&care>start);
 assert.doesNotMatch(source.slice(people,start),/id="churchAiCommand"/);
 assert.match(source.slice(start,care),/const aiWorshipPanel=canWrite\(\)\?/);
 assert.match(source.slice(start,care),/\$\{aiWorshipPanel\}/);
 assert.match(source.slice(start,care),/const commandForm=\$\('churchAiCommand'\)/);
 const runtime=await churchPastorAdminScript().text();
 assert.match(runtime,/scope=worship-access|church_worship_materials/);
});
test('Sunday command parser supports full or short Korean dates and rejects non-Sundays',()=>{
 const match=source.match(/  function churchWorshipDateFromCommand\(command\)\{[\s\S]*?\n  \}/);
 assert.ok(match);
 const parse=new Function('kstDate',match[0]+'\nreturn churchWorshipDateFromCommand;')(()=>'2026-10-17');
 assert.deepEqual(parse('2026년 10월 18일 주일모임 예배 및 유튜브 셋팅'),{date:'2026-10-18',youtube:true});
 assert.deepEqual(parse('10월 18일 주일모임 예배'),{date:'2026-10-18',youtube:false});
 assert.throws(()=>parse('2026년 10월 19일 주일모임 예배'),/일요일/);
 assert.throws(()=>parse('예배 셋팅'),/날짜/);
});
test('AI command never claims static file generation or YouTube scheduling without evidence',()=>{
 assert.match(source,/materials\.json/);
 assert.match(source,/metadata|예약·채널 연결 미확인|연결 미확인/);
 assert.match(source,/공통본문이 승인되지 않아 자동 준비를 중단/);
 assert.match(source,/자료 파일 생성\/배포 대기/);
 assert.doesNotMatch(source,/AIza[0-9A-Za-z_-]{30,}/);
});
