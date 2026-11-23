import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tenantLivePage} from '../tenant-live-page.js';
import {churchLiveCss} from '../tenant-live-church-shell.js';

const live=readFileSync(new URL('../tenant-live.js',import.meta.url),'utf8');
const church={path:'/live/church/',apiTenant:'ekodichurch',mode:'worship',name:'EKODI Church',title:'Live worship',home:'/ekodichurch/',authSite:'church'};
async function selectCurrent(days,today,published=days){
  const first=live.indexOf("        const anchor=Date.parse(todayKst()+'T00:00:00Z')");
  const last=live.indexOf("        if(!date)throw Error('no_current_published_worship');",first);
  assert.ok(first>=0&&last>first);
  const body=live.slice(first,last+"        if(!date)throw Error('no_current_published_worship');".length);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  return new AsyncFunction('days','todayKst','publishedSundays',"let date='';"+body+";return date")(
    days,()=>today,async()=>new Set(published)
  );
}
test('canonical Church LIVE never auto-displays stale, unapproved or absent Sunday as current',async()=>{
  await assert.rejects(selectCurrent(['2026-11-08'],'2026-11-23'),/no_current_published_worship/);
  assert.equal(await selectCurrent(['2026-11-08','2026-11-22'],'2026-11-23'),'2026-11-22');
  assert.equal(await selectCurrent(['2026-11-08','2026-11-22','2026-11-29'],'2026-11-23'),'2026-11-29');
  await assert.rejects(selectCurrent(['2026-11-08','2026-11-22'],'2026-11-27'),/no_current_published_worship/);
  await assert.rejects(selectCurrent(['2026-11-22','2026-11-29'],'2026-11-23',[]),/no_current_published_worship/);
  assert.equal(await selectCurrent(['2026-11-22','2026-11-29'],'2026-11-23',['2026-11-22']),'2026-11-22');
  assert.equal(await selectCurrent(['2026-11-22','2026-11-29'],'2026-11-23',['2026-11-29']),'2026-11-29');
});
test('explicit dated Church materials remain a deliberate archive option',()=>{
  assert.match(live,/if\(specified!==null&&!ISO\.test\(specified\)\)/);
  assert.match(live,/if\(specified\)\{/);
  assert.match(live,/if\(!approved\.has\(specified\)\)throw Error\('worship_not_approved'\)/);
  assert.match(live,/이번 주 공개 승인된 순서지·PPT가 없습니다/);
  assert.match(live,/packet\.date!==date/);
});
test('only canonical Church viewer has six-language guide and verified original-content boundaries',async()=>{
  const html=await (await tenantLivePage(church)).text();
  assert.match(html,/id="churchGuideLanguage"/);
  for(const language of ['ko','en','zh','ja','vi','mn']){
    assert.match(html,new RegExp('<option value="'+language+'">'));
    assert.match(live,new RegExp('^    '+language+':\\[','m'));
  }
  assert.match(live,/LITURGY=/);
  assert.match(live,/translatedOrder\(row\[0\]\)/);
  assert.match(live,/translated\?translated\+' · '\+original:original/);
  assert.match(live,/guideLanguageManual=true/);
  assert.match(live,/event\.target\.value==='original'\?'ko':event\.target\.value/);
  assert.match(live,/Only guide labels are translated/);
  assert.match(live,/button\[data-church-view\]/);
  assert.match(html,/v=20261123-publication-gate/);
  const css=await (await churchLiveCss()).text();
  assert.match(css,/\.church-guide-language select\{/);
  assert.match(css,/@media\(max-width:480px\)/);
  const other=await (await tenantLivePage({...church,path:'/live/mission/',apiTenant:'ekodimission'})).text();
  assert.doesNotMatch(other,/id="churchGuideLanguage"/);
});
