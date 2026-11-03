import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const paths=[
  'space/ekodimission-shell.js',
  'space/ekodimission.js',
  'sites/seonammedi/public/calendar-sidebar.js',
  'sites/seonammedi/public/app.js'
];
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function formatter(path){
  const text=read(path).replace(/\r\n/g,'\n');
  const start=text.indexOf('function formatActivityShare(');
  assert.ok(start>0,path+' formatter exists');
  const end=text.indexOf('\n}\n',start);
  assert.ok(end>start,path+' function ends');
  const ctx={Date,String,Number};
  runInNewContext(text.slice(start,end+3),ctx);
  return ctx.formatActivityShare;
}

test('every EKODI event share adapter uses the same multiline invitation contract',()=>{
  const expected='에코디선교회 토요모임 신청하기\n2026-11-07 (토)\nhttps://ekodi.kr/ekodimission?meeting=2026-11-07#saturday';
  const inputs=[
    '에코디선교회','토요모임','2026-11-07',
    'https://ekodi.kr/ekodimission?meeting=2026-11-07#saturday','신청하기'
  ];
  for(const path of paths){
    const format=formatter(path);
    assert.equal(format(...inputs),expected,path);
    assert.equal(format('에코디선교회','에코디선교회 토요모임','2026-11-07',inputs[3],'신청하기'),expected,path+' never repeats organization');
    assert.equal(format('에코디선교회','에코디선교회 에코디선교회 2026-11-07 (토) 토요모임 신청하기 신청하기','2026-11-07',inputs[3],'신청하기'),expected,path+' collapses repeated organization, date, weekday and CTA');
    assert.equal(format('에코디선교회','토요모임 신청하기','2026-11-07',inputs[3],'신청하기'),expected,path+' never repeats action');
    assert.equal(format('에코디선교회','토요모임 2026.11.07','2026-11-07',inputs[3],'신청하기'),expected,path+' never repeats date');
    assert.equal(format('서남권 국립의대 소통센터','정책 간담회','2026-10-15','https://ekodi.kr/seonammedi/?item=i42','일정 보기'),
      '서남권 국립의대 소통센터 정책 간담회 일정 보기\n2026-10-15 (목)\nhttps://ekodi.kr/seonammedi/?item=i42',path);
    assert.equal(format('에코디교회','교제 모임','','https://ekodi.kr/ekodichurch','자세히 보기'),
      '에코디교회 교제 모임 자세히 보기\nhttps://ekodi.kr/ekodichurch',path);
    assert.equal(format('단체','행사','2026-02-30','https://ekodi.kr/x','신청하기'),
      '단체 행사 신청하기\nhttps://ekodi.kr/x',path+' invalid day not invented');
    assert.equal(format('단체','행사','2026.11.07','https://ekodi.kr/x','신청하기'),
      '단체 행사 신청하기\n2026-11-07 (토)\nhttps://ekodi.kr/x',path+' dotted date supported');
    assert.equal(format('단체','행사\n알림','','https://ekodi.kr/x','참여하기'),
      '단체 행사 알림 참여하기\nhttps://ekodi.kr/x',path+' one headline');
  }
});

test('Mission shares current Saturday through the exact application URL and full copy',()=>{
  const shell=read(paths[0]);
  assert.match(shell,/encodeURIComponent\(date\)\+'#saturday','토요모임',date,'신청하기'/);
  assert.match(shell,/Object\.assign\(button\.dataset,\{shareUrl:url,shareTitle:title,shareDate:date,shareAction:action\}\)/);
  assert.match(shell,/navigator\.share\(\{text:message\}\)/);
  assert.match(shell,/navigator\.clipboard\.writeText\(message\)/);
  assert.match(shell,/document\.createElement\('textarea'\)/);
  const mission=read(paths[1]);
  assert.match(mission,/navigator\.share\(\{text:shareMessage\}\)/);
  assert.match(mission,/copy\(shareMessage/);
});

test('Seonam calendar and activity share send the message as one field with no duplicate URL',()=>{
  const calendar=read(paths[2]),app=read(paths[3]);
  assert.match(calendar,/const shareSummary=item=>\{const url=shareUrl\(item\);return url\?formatActivityShare/);
  assert.match(calendar,/text:shareMessage\(item\)/);
  assert.doesNotMatch(calendar,/text:shareMessage\(item\),\s*url/);
  assert.match(calendar,/navigator\.clipboard\.writeText\(shareMessage\(item\)\)/);
  assert.match(app,/data-share-date=/);
  assert.match(app,/navigator\.share\(\{text:message\}\)/);
  assert.match(app,/navigator\.clipboard\.writeText\(message\)/);
  assert.match(app,/window\.prompt\([^,]+,message\)/);
});
