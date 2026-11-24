// Isolated first-party Chromium proof of the deployed Church notice listing.
// The app, CSS and routing are REAL production assets. Only GET board data is synthetic.
// All HTTP mutations are blocked; no user Opera session, credentials or real post edits.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const CHURCH_NOTICE_COMPACT_PROOF='ekodi.church.notice.compact.v1';
export async function verifyChurchNoticeCompact({executablePath=process.env.CHROME_BIN}={}){
  assert.ok(executablePath,'first-party runner must supply Chromium');
  const reports=[];
  const browser=await puppeteer.launch({
    executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    await mkdir('/tmp/church-notice-compact-proof',{recursive:true});
    const posts=[
      {id:101,title:'11월 15일 교회소식',body:'E2E_SYNTHETIC_NOTICE_BODY_VISIBLE_ONLY_ON_DETAIL',createdAt:'2026-11-21T10:00:00Z',categoryId:'notice',status:'published'},
      {id:102,title:'11월 8일 교회소식',body:'E2E_SYNTHETIC_SECOND_POST_BODY',createdAt:'2026-11-20T10:00:00Z',categoryId:'notice',status:'published'},
      {id:103,title:'10월 25일 교회소식',body:'E2E_SYNTHETIC_THIRD_POST_BODY',createdAt:'2026-11-19T10:00:00Z',categoryId:'notice',status:'published'}
    ];
    for(const width of [390,1366]){
      const page=await browser.newPage();
      const forbiddenWrites=[],backgroundWrites=[];
      try{
        await page.setViewport({width,height:width===390?844:900,deviceScaleFactor:1});
        await page.setRequestInterception(true);
        page.on('request',req=>{
          const u=new URL(req.url());
          if(!['GET','HEAD','OPTIONS'].includes(req.method())){
            const background=u.pathname.startsWith('/cdn-cgi/')||u.pathname==='/api/telemetry/visit';
            (background?backgroundWrites:forbiddenWrites).push({method:req.method(),class:background?'blocked-background':'forbidden'});
            void req.abort('blockedbyclient');
            return;
          }
          if(u.origin==='https://ekodi.kr'&&u.pathname==='/ekodichurch/board/api/posts'){
            void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,items:posts})});
            return;
          }
          void req.continue();
        });
        const release=encodeURIComponent(process.env.CHURCH_SOURCE_SHA||'current');
        await page.goto('https://ekodi.kr/ekodichurch/notices/?release='+release,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForFunction(
          ()=>document.querySelectorAll('[data-church-notices] .church-public-notice-line').length===3,
          {timeout:25000}
        );
        const index=await page.evaluate(()=>{
          const rows=[...document.querySelectorAll('[data-church-notices] .church-public-notice')];
          const first=rows[0].querySelector('.church-public-notice-line');
          const title=first.querySelector('a.church-public-link');
          const date=first.querySelector('time');
          const a=title.getBoundingClientRect(),b=date.getBoundingClientRect(),c=first.getBoundingClientRect();
          return {
            count:rows.length,
            titles:rows.map(row=>row.querySelector('.church-public-link')?.textContent),
            dates:rows.map(row=>row.querySelector('time')?.textContent),
            previewCount:document.querySelectorAll('[data-church-notices] .church-public-excerpt').length,
            containsBody:document.querySelector('[data-church-notices]').textContent.includes('E2E_SYNTHETIC_NOTICE_BODY'),
            dateRightEdgeGap:Math.abs(c.right-b.right),
            titleLeft:a.left,dateLeft:b.left,
            horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2
          };
        });
        assert.equal(index.count,3,'three compact notice rows');
        assert.deepEqual(index.titles,posts.map(post=>post.title));
        assert.equal(index.previewCount,0,'notice list must never render body excerpt');
        assert.equal(index.containsBody,false,'notice body must be hidden in list DOM');
        assert.ok(index.dateRightEdgeGap<=5,'date must align with right edge');
        assert.ok(index.dateLeft>index.titleLeft,'date must be to the right of title');
        assert.equal(index.horizontalOverflow,false,'no horizontal overflow');
        // '11월 15일 교회소식'처럼 제목에 주간 날짜가 있으면 그 날짜를 표시한다(ekodi-church#200, noticePublishedDay).
        assert.match(index.dates[0]||'',/11월 15일/);
        assert.doesNotMatch(index.dates[0]||'',/11월 21일/,'title issue date must win over createdAt');
        await page.screenshot({path:'/tmp/church-notice-compact-proof/'+width+'-list.png',fullPage:false});
        await Promise.all([
          page.waitForNavigation({waitUntil:'domcontentloaded',timeout:20000}),
          page.click('[data-church-notices] .church-public-notice:first-child a.church-public-link')
        ]);
        await page.waitForFunction(
          ()=>document.querySelector('[data-church-notices] .church-public-body')?.textContent?.includes('E2E_SYNTHETIC_NOTICE_BODY_VISIBLE_ONLY_ON_DETAIL'),
          {timeout:25000}
        );
        const detail=await page.evaluate(()=>({
          title:document.querySelector('.church-public-notice-detail h2')?.textContent,
          body:document.querySelector('.church-public-notice-detail .church-public-body')?.textContent,
          back:document.querySelector('[data-church-notices] a.church-public-back')?.getAttribute('href'),
          href:location.pathname+location.search,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2
        }));
        assert.equal(detail.title,posts[0].title);
        assert.equal(detail.body,posts[0].body,'full body appears only in selected post detail');
        assert.equal(detail.back,'/ekodichurch/notices/');
        assert.match(detail.href,/post=101/);
        assert.equal(detail.horizontalOverflow,false);
        assert.deepEqual(forbiddenWrites,[],'public notice browsing must not mutate the board');
        await page.screenshot({path:'/tmp/church-notice-compact-proof/'+width+'-detail.png',fullPage:false});
        reports.push({width,index,detail:{title:detail.title,bodyVisible:true,back:detail.back},forbiddenWrites:0,blockedBackgroundRequests:backgroundWrites.length});
      }finally{await page.close();}
    }
    console.log('EKODI_CHURCH_NOTICE_COMPACT_PROOF='+JSON.stringify({contract:CHURCH_NOTICE_COMPACT_PROOF,status:'pass',devices:reports}));
    return {ok:true,devices:reports};
  }finally{await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  verifyChurchNoticeCompact().catch(error=>{console.error('[CHURCH NOTICE COMPACT] '+error.message);process.exitCode=1;});
}
