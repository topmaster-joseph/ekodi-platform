// First-party Church public news: verified "Community Announce" sections in the
// 2026 Sunday bulletins. No private prayers, contacts, attendance or bank details.
// Source-of-truth additions require a reviewed and protected EKODI source release.
export const CHURCH_WEEKLY_NEWS_2026=Object.freeze([
  {date:'2026-09-06',items:['9월 공통 매일묵상에 함께 참여하며 말씀을 삶에서 살아내는 공동체를 세워 갑니다.']},
  {date:'2026-09-13',items:['9월 공통 매일묵상을 이어 가며 말씀을 나누고 실천하도록 초대합니다.']},
  {date:'2026-09-20',items:['9월 공통 매일묵상으로 각자의 일상에서 말씀을 살아내도록 함께합니다.']},
  {date:'2026-09-27',items:['9월 26일 한가위 열린식탁·팟트럭·나눔마켓을 함께 섬겨 주신 모든 분께 감사드립니다.']},
  {date:'2026-10-04',items:['10월 3~4일 에코디 가을여행(고창·영광)에 동참하고 섬겨 주신 모든 분께 감사드립니다.']},
  {date:'2026-10-11',items:['어린이와 처음 온 이웃까지 함께 말씀을 듣고 배우는 공동체가 되도록 기도해 주세요.']},
  {date:'2026-10-18',items:['10월 18일은 직장선교주일입니다. 일터에서 복음을 살아내는 이웃을 위해 기도합니다.','10월 19~24일 기독교교육주간을 기억하며 교육과 다음 세대를 위해 기도합니다.']},
  {date:'2026-10-25',items:['10월 25일 종교개혁주일, 말씀과 은혜 앞에서 교회를 돌아보고 이웃과 함께하는 개혁을 다짐합니다.','형제의 고통을 외면하지 않고 회복의 기회를 함께 여는 공동체가 되도록 기도합니다.']},
  {date:'2026-11-01',items:['11월 1일은 학원선교주일입니다. 학교와 배움의 자리에서 복음을 심고 가꾸는 이들을 위해 기도합니다.','사람을 따라 나뉘지 않고 그리스도 안에서 함께 자라는 공동체를 소망합니다.']},
  {date:'2026-11-08',items:['11월 15일 주일모임 후 공동의회를 예고했습니다. 세례교인의 참석을 안내합니다.','주보에 안내된 안건: 2025년 결산·2026년 예산 승인, 교회 정관 제정, 에코디비즈의 교회 공간 일부 무상사용 승인, 2027년 목포노회 동반성장 자립화교회 지원 신청.']},
  {date:'2026-11-15',items:['11월 15일 주일모임 후 공동의회가 있음을 안내했습니다. 세례교인의 참석을 요청했습니다.','11월 22일 주일모임은 추수감사주일로 드린다고 예고했습니다.']}
].map(x=>Object.freeze({date:x.date,items:Object.freeze(x.items)})));

export const CHURCH_NEWS_PUBLISHER='system:church-monthly-news';
export const CHURCH_NEWS_FIRST_SUNDAY='2026-09-06';
const KST='Asia/Seoul';
const monthName=value=>Number(value.split('-')[1])+'월';
const sourceKeyFor=day=>day.slice(0,7);
const dayLabel=day=>Number(day.slice(5,7))+'월 '+Number(day.slice(8))+'일';

export function previousCompletedChurchSunday(at=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:KST,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
  const value=type=>parts.find(part=>part.type===type)?.value||'';
  const local=[value('year'),value('month'),value('day')].join('-');
  const date=new Date(local+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()||7));
  return date.toISOString().slice(0,10);
}

export function approvedChurchMonthlyPublications(at=new Date()){
  const previousSunday=previousCompletedChurchSunday(at);
  const published=CHURCH_WEEKLY_NEWS_2026.filter(week=>week.date<=previousSunday&&week.date>=CHURCH_NEWS_FIRST_SUNDAY);
  const groups=new Map();
  for(const week of published){
    const key=sourceKeyFor(week.date);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(week);
  }
  return [...groups].map(([key,weeks])=>{
    const recurring=[
      '새로 나오시거나 오랜만에 함께하신 분을 주님의 이름으로 환영합니다.',
      '매주 화요일 오전 10시 평공목(평생공부하는목회자) 모임이 있습니다.',
      '매주 토요일 오전 11시 에코디 토요모임을 위해 함께 기도합니다.',
      '매주 일요일 함께찬양하는사람들(함찬사) 모임을 위해 기도합니다.'
    ];
    const body=[
      '2026년 '+monthName(key)+' 에코디교회 교회소식',
      '',
      '[매주 공동체 안내]',
      ...recurring.map(item=>'• '+item),
      '',
      ...weeks.flatMap(week=>[
        '['+dayLabel(week.date)+' 주보]',
        ...week.items.map(item=>'• '+item),
        ''
      ]),
      '이 기록은 각 주일 주보의 「Community Announce」 공개 안내를 토대로 정리했습니다.',
      '개인 건강·상담·연락처·재정·출석 인원 등 민감한 세부사항은 게시하지 않습니다.'
    ].join('\n').trim();
    return Object.freeze({sourceKey:key,title:monthName(key)+' 교회소식',body,weekCount:weeks.length});
  });
}

// Durable system publications on the already authorized Church board only.
// No HTTP write route is added. Incoming human POST/PATCH/DELETE still require
// an authenticated *board-local* editor/owner; anonymous writes remain forbidden.
export async function syncApprovedChurchMonthlyNotices(env,instance,at=new Date()){
  if(instance?.site_id!=='ekodichurch'||instance.status!=='active'||!env?.DB?.prepare)return {published:0,updated:0};
  const publications=approvedChurchMonthlyPublications(at);
  if(!publications.length)return {published:0,updated:0};
  const DB=env.DB;
  await DB.batch([
    DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ekodi_board_church_monthly_news
      ON ekodi_board_posts(board_id,author_person_id)
      WHERE author_person_id GLOB 'system:church-monthly-news:*'`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_auto_news_sources(
      board_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      last_published_body TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(board_id,source_key)
    )`)
  ]);
  const stamp=at.toISOString();
  const boardId=instance.board_id;
  await DB.prepare(`INSERT OR IGNORE INTO ekodi_board_categories
    (board_id,category_id,name,sort_order,status,created_at,updated_at)
    VALUES (?,'notice','공지사항',10,'active',?,?)`).bind(boardId,stamp,stamp).run();
  let published=0,updated=0;
  for(const item of publications){
    const sourceKey='church-monthly-news:'+item.sourceKey;
    const author=CHURCH_NEWS_PUBLISHER+':'+item.sourceKey;
    const old=await DB.prepare(`SELECT id,body,status FROM ekodi_board_posts
      WHERE board_id=? AND author_person_id=? LIMIT 1`).bind(boardId,author).first();
    let createdNow=false;
    if(!old){
      const result=await DB.prepare(`INSERT OR IGNORE INTO ekodi_board_posts
        (board_id,author_person_id,author_email,title,body,status,created_at,updated_at)
        VALUES (?,?,'',?,?,'published',?,?)`).bind(boardId,author,item.title,item.body,stamp,stamp).run();
      createdNow=Number(result?.meta?.changes||0)>0;
      if(createdNow)published++;
    }
    const post=await DB.prepare(`SELECT id,body,status FROM ekodi_board_posts
      WHERE board_id=? AND author_person_id=? LIMIT 1`).bind(boardId,author).first();
    // Deleting a post by a human editor must not be silently reversed.
    if(!post||post.status!=='published')continue;
    await DB.prepare(`INSERT OR IGNORE INTO ekodi_board_post_categories
      (board_id,post_id,category_id) VALUES (?,?,'notice')`).bind(boardId,post.id).run();
    if(createdNow){
      await DB.prepare(`INSERT INTO ekodi_board_audit
        (board_id,actor_person_id,action,target_type,target_id,detail_json,created_at)
        VALUES (?,?,'post.auto.create','post',?,?,?)`)
        .bind(boardId,author,String(post.id),JSON.stringify({sourceKey,weekCount:item.weekCount}),stamp).run();
    }
    const tracked=await DB.prepare(`SELECT last_published_body FROM ekodi_board_auto_news_sources
      WHERE board_id=? AND source_key=? LIMIT 1`).bind(boardId,sourceKey).first();
    if(!tracked){
      if(post.body===item.body){
        await DB.prepare(`INSERT OR IGNORE INTO ekodi_board_auto_news_sources
          (board_id,source_key,post_id,last_published_body,updated_at) VALUES (?,?,?,?,?)`)
          .bind(boardId,sourceKey,post.id,item.body,stamp).run();
      }
      continue;
    }
    if(tracked.last_published_body===item.body||post.body!==tracked.last_published_body)continue;
    const change=await DB.prepare(`UPDATE ekodi_board_posts SET body=?,updated_at=?
      WHERE board_id=? AND id=? AND status='published' AND body=?`)
      .bind(item.body,stamp,boardId,post.id,tracked.last_published_body).run();
    if(Number(change?.meta?.changes||0)<1)continue;
    await DB.prepare(`UPDATE ekodi_board_auto_news_sources SET last_published_body=?,updated_at=?
      WHERE board_id=? AND source_key=? AND post_id=?`)
      .bind(item.body,stamp,boardId,sourceKey,post.id).run();
    await DB.prepare(`INSERT INTO ekodi_board_audit
      (board_id,actor_person_id,action,target_type,target_id,detail_json,created_at)
      VALUES (?,?,'post.auto.update','post',?,?,?)`)
      .bind(boardId,author,String(post.id),JSON.stringify({sourceKey,weekCount:item.weekCount}),stamp).run();
    updated++;
  }
  return {published,updated,months:publications.length};
}
