import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tenantLivePage} from '../tenant-live-page.js';
import {churchLiveCss} from '../tenant-live-church-shell.js';

const live=readFileSync(new URL('../tenant-live.js',import.meta.url),'utf8');
const church={path:'/live/church/',apiTenant:'ekodichurch',mode:'worship',name:'EKODI Church',title:'Live worship',home:'/ekodichurch/',authSite:'church'};
function selectCurrent(days,today){
  const first=live.indexOf("        const anchor=Date.parse(todayKst()+'T00:00:00Z')");
  const last=live.indexOf("        if(!date)throw Error('no_current_published_worship');",first);
  assert.ok(first>=0&&last>first);
  const body=live.slice(first,last+"        if(!date)throw Error('no_current_published_worship');".length);
  return new Function('days','todayKst',"let date='';"+body+";return date")(days,()=>today);
}
test('canonical Church LIVE never auto-displays stale Sunday as the current service',()=>{
  assert.throws(()=>selectCurrent(['2026-11-08'],'2026-11-23'),/no_current_published_worship/);
  assert.equal(selectCurrent(['2026-11-08','2026-11-22'],'2026-11-23'),'2026-11-22');
  assert.equal(selectCurrent(['2026-11-08','2026-11-22','2026-11-29'],'2026-11-23'),'2026-11-29');
  assert.throws(()=>selectCurrent(['2026-11-08','2026-11-22'],'2026-11-27'),/no_current_published_worship/);
});
test('explicit dated Church materials remain a deliberate archive option',()=>{
  assert.match(live,/if\(specified!==null&&!ISO\.test\(specified\)\)/);
  assert.match(live,/if\(specified\)date=specified/);
  assert.match(live,/이번 주 공개 예배자료가 아직 없습니다/);
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
  assert.match(html,/v=20261123-fresh-language/);
  const css=await (await churchLiveCss()).text();
  assert.match(css,/\.church-guide-language select\{/);
  assert.match(css,/@media\(max-width:480px\)/);
  const other=await (await tenantLivePage({...church,path:'/live/mission/',apiTenant:'ekodimission'})).text();
  assert.doesNotMatch(other,/id="churchGuideLanguage"/);
});
