// First-party Church Pages production calendar proof with synthetic published metadata.
// The browser blocks all HTTP mutations and uses zero real accounts, user Opera tabs,
// production board posts or external destinations.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const CHURCH_SCHEDULE_DETAIL_PROOF='ekodi.church.calendar.detail.v1';
const localDay=()=>{
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=name=>p.find(item=>item.type===name)?.value||'';
  return [part('year'),part('month'),part('day')].join('-');
};
const dayNear=day=>{
  const [y,m,d]=day.split('-').map(Number);
  const n=new Date(Date.UTC(y,m-1,d));
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  n.setUTCDate(d===last?d-1:d+1);
  return n.toISOString().slice(0,10);
};
export async function verifyChurchScheduleDetail({executablePath=process.env.CHROME_BIN}={}){
  assert.ok(executablePath,'official runner must provide Chromium');
  const today=localDay(),other=dayNear(today);
  const endpoint='https://ekodi.kr/ekodichurch/board/api/shared-schedules';
  const body=JSON.stringify({ok:true,mode:'published-read-only',items:[
    {id:'native-church',source:'ekodichurch',kind:'church-key-event',date:today,time:'11:00',venue:'에코디교회',title:'공개 일정 상세 검증',url:'/ekodichurch/board/post/123',sourceLabel:'교회 공개 일정'},
    {id:'native-mission',source:'ekodimission',kind:'mission-meeting',date:today,time:'14:00',venue:'선교회 모임장소',title:'공개 선교회 일정',url:'/ekodimission/',sourceLabel:'공개 선교회 상세'},
    {id:'native-other',source:'ekodichurch',kind:'church-key-event',date:other,time:'16:00',venue:'에코디교회',title:'다른 날짜 공개 일정',url:'/ekodichurch/schedule/',sourceLabel:'다른 날 일정'}
  ]});
  const events=[];
  const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    await mkdir('/tmp/church-calendar-detail-proof',{recursive:true});
    for(const width of [390,1366]){
      const page=await browser.newPage();
      try{
        await page.setViewport({width,height:width===390?844:900,deviceScaleFactor:1});
        const forbiddenWrites=[],backgroundWrites=[];
        await page.setRequestInterception(true);
        page.on('request',req=>{
          const u=new URL(req.url());
          if(!['GET','HEAD','OPTIONS'].includes(req.method())){
            const allowedBackground=u.pathname.startsWith('/cdn-cgi/')||u.pathname==='/api/telemetry/visit';
            (allowedBackground?backgroundWrites:forbiddenWrites).push({method:req.method(),source:allowedBackground?'background':'unknown'});
            void req.abort('blockedbyclient');return;
          }
          if(req.method()==='GET'&&u.origin==='https://ekodi.kr'&&u.pathname==='/ekodichurch/board/api/shared-schedules'){
            void req.respond({status:200,contentType:'application/json',body});return;
          }
          if(req.method()==='GET'&&u.origin==='https://ekodi.kr'&&u.pathname==='/ekodichurch/board/api/posts/123'){
            void req.respond({status:200,contentType:'application/json',body:JSON.stringify({id:123,body:JSON.stringify({date:today,time:'11:00',venue:'에코디교회',description:'주보 원문에 근거해 공개한 일정 상세내용'})})});return;
          }
          void req.continue();
        });
        const release=encodeURIComponent(process.env.CHURCH_SOURCE_SHA||'current');
        await page.goto('https://ekodi.kr/ekodichurch/schedule/?release='+release,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForFunction(()=>document.querySelectorAll('[data-church-calendar-days] button[data-date]').length>=28,{timeout:30000});
        await page.waitForFunction(()=>document.querySelectorAll('[data-church-schedules-list] button.church-schedule-event-select').length===2,{timeout:20000});
        const first=await page.evaluate(expected=>{
          const a=document.querySelector('[data-church-shared-calendar]').getBoundingClientRect();
          const b=document.querySelector('.church-schedule-day').getBoundingClientRect();
          return{
            selected:document.querySelector('[data-church-calendar-days] button[aria-pressed="true"]')?.dataset.date,
            listCount:document.querySelectorAll('[data-church-schedules-list] button.church-schedule-event-select').length,
            stacked:b.top>=a.bottom-4,
            overflow:document.documentElement.scrollWidth>innerWidth+2,
            detailHidden:document.querySelector('[data-church-event-detail]').hidden
          };
        },today);
        assert.equal(first.selected,today,'calendar must select today automatically');
        assert.equal(first.listCount,2,'today must list both published Church and Mission events');
        assert.equal(first.stacked,true,'selected day must visually appear below calendar');
        assert.equal(first.overflow,false,'mobile and desktop must fit viewport');
        assert.equal(first.detailHidden,true,'no event detail until explicitly selected');
        await page.click('[data-church-schedules-list] .church-schedule-event-select');
        await page.waitForFunction(()=>document.querySelector('[data-church-event-detail]')?.textContent?.includes('주보 원문에 근거해 공개한 일정 상세내용'),{timeout:8000});
        const primary=await page.evaluate(()=>({
          title:document.querySelector('[data-church-event-detail] h3')?.textContent||'',
          detail:document.querySelector('[data-church-event-detail] p')?.textContent||'',
          originalHref:document.querySelector('[data-church-event-detail] a')?.getAttribute('href')||'',
          expanded:document.querySelectorAll('[data-church-schedules-list] button[aria-expanded="true"]').length
        }));
        assert.equal(primary.title,'공개 일정 상세 검증');
        assert.equal(primary.originalHref,'/ekodichurch/board/post/123');
        assert.equal(primary.expanded,1);
        const buttons=await page.$$('[data-church-schedules-list] .church-schedule-event-select');
        await buttons[1].click();
        await page.waitForFunction(()=>document.querySelector('[data-church-event-detail] h3')?.textContent==='공개 선교회 일정',{timeout:7000});
        const mission=await page.evaluate(()=>({
          detail:document.querySelector('[data-church-event-detail] p')?.textContent,
          link:document.querySelector('[data-church-event-detail] a')?.getAttribute('href')
        }));
        assert.equal(mission.detail,'공개 선교회 상세');
        assert.equal(mission.link,'/ekodimission/');
        await page.click('[data-church-calendar-days] button[data-date="'+other+'"]');
        await page.waitForFunction(()=>document.querySelectorAll('[data-church-schedules-list] button.church-schedule-event-select').length===1,{timeout:7000});
        assert.equal(await page.$eval('[data-church-event-detail]',node=>node.hidden),true,'changing the day must clear prior event details');
        await page.click('[data-church-calendar-today]');
        assert.equal(await page.$eval('[data-church-calendar-days] button[aria-pressed="true"]',node=>node.dataset.date),today);
        assert.deepEqual(forbiddenWrites,[],'local public schedule viewing may never send server mutations');
        await page.screenshot({path:'/tmp/church-calendar-detail-proof/'+width+'.png',fullPage:false});
        events.push({width,today,first,primary,mission,forbiddenWrites:forbiddenWrites.length,blockedBackgroundRequests:backgroundWrites.length});
      }finally{await page.close();}
    }
    console.log('EKODI_CHURCH_SCHEDULE_DAY_DETAIL_PROOF='+JSON.stringify({contract:CHURCH_SCHEDULE_DETAIL_PROOF,status:'pass',devices:events}));
    return {ok:true,devices:events};
  }finally{await browser.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  verifyChurchScheduleDetail().catch(e=>{console.error('[CHURCH SCHEDULE DETAIL] '+e.message);process.exitCode=1});
}
