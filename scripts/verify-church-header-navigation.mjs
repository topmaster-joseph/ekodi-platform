import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * The live Church Pages deployment supports one of two reviewed, mutually
 * exclusive top-level navigation contracts. Other release/privacy gates stay
 * unchanged. This does not authorize the C3 source transition or bypass a PR.
 */
const MODERN=[
  ['/ekodichurch/devotion/','매일묵상'],
  ['/ekodichurch/#worship','예배·방송'],
  ['/ekodichurch/notices/','공지사항'],
  ['/ekodichurch/schedule/','주요일정'],
  ['/ekodichurch/#together','함께하기'],
  ['/ekodichurch/my/','마이페이지']
];
const requiredNested=[
  "['예배안내','#worship']",
  "['주보·PPT','#weekly-worship']",
  "['온라인 방송','#online']",
  "['공동체','#community']",
  "['협력소식','#partner-news']",
  "['오시는 길','#location']",
  "['참여·후원','/ekodichurch/together/']",
  "['큐티인 신청','/qtin/church']"
];
const fail=message=>{throw new Error('Church header release gate: '+message)};
const extractNav=html=>{
  if(typeof html!=='string')fail('missing HTML');
  const matches=[...html.matchAll(/<nav\b[^>]*\bid="main-nav"[^>]*>([\s\S]*?)<\/nav>/g)];
  if(matches.length!==1)fail('missing or duplicate primary navigation');
  return matches[0][1];
};
const links=nav=>[...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([,attrs,body])=>{
  const href=attrs.match(/\bhref="([^"]+)"/)?.[1]||'';
  return [href,body.replace(/<[^>]*>/g,'').trim()];
});

export function verifyChurchHeaderNavigation(html,nestedScript=''){
  const nav=extractNav(html),items=links(nav);
  const legacy=items.some(([href,label])=>href==='#weekly-worship'&&label==='예배자료');
  const modern=items.length===MODERN.length && MODERN.every(([href,label],index)=>
    items[index][0]===href && items[index][1]===label);
  if(legacy && modern)fail('ambiguous navigation version');
  if(legacy){
    if(!html.includes('data-church-weekly'))fail('legacy worship editor missing');
    return Object.freeze({contract:'legacy-reviewed',primaryItems:items.length});
  }
  if(!modern)fail('unapproved primary navigation; expected original 예배자료 or exact six-item menu');
  if(!html.includes('src="church-section-nav.js" defer'))fail('selected-content controller not loaded');
  if(!html.includes('church-compact-navigation.css'))fail('responsive navigation stylesheet missing');
  if(!html.includes('data-church-weekly'))fail('date-scoped worship content missing');
  if(!html.includes('data-church-notices')||!html.includes('data-church-shared-schedules'))
    fail('public notices or approved Church/Mission calendar missing');
  if(typeof nestedScript!=='string'||!nestedScript.includes('church-section-filtered'))
    fail('single-selection controller unavailable');
  for(const marker of requiredNested)if(!nestedScript.includes(marker))
    fail('required contextual action not preserved: '+marker);
  if(!nestedScript.includes("window.addEventListener('hashchange',show)"))
    fail('back-forward navigation restoration missing');
  if(nav.includes('오늘의 삶')||nav.includes('공동체')||nav.includes('협력소식'))
    fail('retired primary menu item returned');
  return Object.freeze({contract:'six-item-selected-content',primaryItems:6,contextItems:requiredNested.length});
}


/**
 * Strictly verify the actual publicly served subpage navigation. The Church
 * home and subpages must share the same reviewed six-link contract; otherwise
 * a successful static Pages deploy may mask an older routed or cached page.
 * This is a read-only release gate, not a source-switch authorization.
 */
export function verifyChurchPublicSubpageNavigation(html,page) {
  if(!['devotion','notices','schedule'].includes(page))fail('unsupported subpage');
  const nav=extractNav(html),items=links(nav);
  if(items.length!==MODERN.length||!MODERN.every(([href,label],index)=>
    items[index][0]===href&&items[index][1]===label)){
    fail('public '+page+' subpage has stale or inconsistent six-item navigation');
  }
  const expected='/ekodichurch/'+page+'/';
  const active=[...nav.matchAll(/<a\\b([^>]*)>[\\s\\S]*?<\\/a>/g)]
    .filter(([,attrs])=>/\\baria-current\\s*=\\s*"page"/.test(attrs))
    .map(([,attrs])=>attrs.match(/\\bhref="([^"]+)"/)?.[1]||'');
  if(active.length!==1||active[0]!==expected)fail('public '+page+' subpage active route mismatch');
  if(!html.includes('church-compact-navigation.css')||
    !html.includes('church-shell.js')||
    !html.includes('class="menu-button"')||
    !html.includes('data-ekodi-service-footer')){
    fail('public '+page+' subpage common shell missing');
  }
  const required={
    devotion:['data-ekodi-devotion','/bible/devotion.js'],
    notices:['data-church-notices','data-church-public-manage hidden'],
    schedule:['data-church-shared-schedules','data-church-public-manage hidden']
  };
  for(const marker of required[page])if(!html.includes(marker))fail('public '+page+' content/role guard missing: '+marker);
  return Object.freeze({contract:'six-item-subpage',page,primaryItems:6});
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const args=process.argv.slice(2);
    if(args[0]==='--subpage'){
      if(!args[1]||args[2]!=='--kind'||!args[3])fail('expected --subpage PUBLIC_HTML --kind devotion|notices|schedule');
      const result=verifyChurchPublicSubpageNavigation(readFileSync(args[1],'utf8'),args[3]);
      process.stdout.write(JSON.stringify(result)+'\\n');
      process.exit(0);
    }
    if(args[0]!=='--html'||!args[1]||args[2]!=='--subnav'||!args[3])
      fail('expected --html CHURCH_HOME --subnav OPTIONAL_CONTROLLER_FILE');
    const html=readFileSync(args[1],'utf8');
    let nested='';
    try{nested=readFileSync(args[3],'utf8')}catch(error){
      if(error.code!=='ENOENT')throw error;
    }
    const result=verifyChurchHeaderNavigation(html,nested);
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
