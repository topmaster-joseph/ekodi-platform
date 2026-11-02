(()=>{
'use strict';
if(window.__EKODI_CHURCH_HEADER_CONTROLS__)return;
window.__EKODI_CHURCH_HEADER_CONTROLS__=true;

const EXTENDED=new Set(['my','kac','vi','mn','id']);
const MUSIC={
  'ko-KR':{off:'♫ 음악',on:'♫ 끄기',play:'배경 음악 재생',stop:'배경 음악 끄기'},
  en:{off:'♫ Music',on:'♫ Off',play:'Play background music',stop:'Turn off background music'},
  'zh-CN':{off:'♫ 音乐',on:'♫ 关闭',play:'播放背景音乐',stop:'关闭背景音乐'},
  ja:{off:'♫ 音楽',on:'♫ オフ',play:'BGMを再生',stop:'BGMをオフ'},
  my:{off:'♫ သီချင်း',on:'♫ ပိတ်',play:'နောက်ခံသီချင်း ဖွင့်ရန်',stop:'နောက်ခံသီချင်း ပိတ်ရန်'},
  kac:{off:'♫ Mahkawn',on:'♫ Pat',play:'Mahkawn hpe hpaw',stop:'Mahkawn hpe pat'},
  vi:{off:'♫ Nhạc',on:'♫ Tắt',play:'Phát nhạc nền',stop:'Tắt nhạc nền'},
  mn:{off:'♫ Хөгжим',on:'♫ Унтраах',play:'Дэвсгэр хөгжим тоглуулах',stop:'Дэвсгэр хөгжим унтраах'},
  id:{off:'♫ Musik',on:'♫ Mati',play:'Putar musik latar',stop:'Matikan musik latar'}
};
const SCHEDULE={
  'ko-KR':[
    ['주일모임','매주 일요일 오전 11시','예배실'],
    ['토요모임','매주 토요일 오전 11시','예배실'],
    ['심야기도','매일 저녁 11시 30분','예배실']
  ],
  en:[
    ['Sunday Gathering','Every Sunday · 11:00 AM','Worship room'],
    ['Saturday Gathering','Every Saturday · 11:00 AM','Worship room'],
    ['Late-night Prayer','Daily · 11:30 PM','Worship room']
  ],
  'zh-CN':[
    ['主日聚会','每周日 上午11:00','礼拜室'],
    ['周六聚会','每周六 上午11:00','礼拜室'],
    ['深夜祷告','每晚 11:30','礼拜室']
  ],
  ja:[
    ['主日集会','毎週日曜 午前11:00','礼拝室'],
    ['土曜集会','毎週土曜 午前11:00','礼拝室'],
    ['深夜祈祷','毎日 午後11:30','礼拝室']
  ],
  my:[
    ['တနင်္ဂနွေ စုဝေးပွဲ','တနင်္ဂနွေတိုင်း မနက် 11:00','ဝတ်ပြုခန်း'],
    ['စနေနေ့ စုဝေးပွဲ','စနေတိုင်း မနက် 11:00','ဝတ်ပြုခန်း'],
    ['ညဉ့်နက် ဆုတောင်းခြင်း','နေ့တိုင်း ည 11:30','ဝတ်ပြုခန်း']
  ],
  kac:[
    ['Sunday Zuphpawng','Sunday shagu 11:00 AM','Nawku gawk'],
    ['Saturday Zuphpawng','Saturday shagu 11:00 AM','Nawku gawk'],
    ['Shana akyu hpyi','Shani shagu 11:30 PM','Nawku gawk']
  ],
  vi:[
    ['Nhóm Chúa nhật','Mỗi Chúa nhật · 11:00','Phòng thờ phượng'],
    ['Nhóm thứ Bảy','Mỗi thứ Bảy · 11:00','Phòng thờ phượng'],
    ['Cầu nguyện đêm','Mỗi tối · 23:30','Phòng thờ phượng']
  ],
  mn:[
    ['Нямын цуглаан','Ням бүр · 11:00','Мөргөлийн өрөө'],
    ['Бямбын цуглаан','Бямба бүр · 11:00','Мөргөлийн өрөө'],
    ['Шөнийн залбирал','Өдөр бүр · 23:30','Мөргөлийн өрөө']
  ],
  id:[
    ['Pertemuan Minggu','Setiap Minggu · 11.00','Ruang ibadah'],
    ['Pertemuan Sabtu','Setiap Sabtu · 11.00','Ruang ibadah'],
    ['Doa malam','Setiap hari · 23.30','Ruang ibadah']
  ]
};
const FOCUS={
  'ko-KR':{daily:'매일묵상',dailyFallback:'오늘의 말씀으로 하루를 시작합니다.',dailyCta:'오늘 묵상 보기 →',sermon:'주일설교',sermonFallback:'이번 주 주일설교를 바로 만나보세요.',sermonCta:'주일설교 보기 →'},
  en:{daily:'Daily Meditation',dailyFallback:'Begin today with Scripture.',dailyCta:'Open today’s meditation →',sermon:'Sunday Sermon',sermonFallback:'Go straight to this week’s Sunday sermon.',sermonCta:'Open Sunday sermon →'},
  'zh-CN':{daily:'每日默想',dailyFallback:'以今天的经文开始新的一天。',dailyCta:'查看今日默想 →',sermon:'主日讲道',sermonFallback:'直接进入本周主日讲道。',sermonCta:'查看主日讲道 →'},
  ja:{daily:'毎日の黙想',dailyFallback:'今日のみことばから一日を始めます。',dailyCta:'今日の黙想を見る →',sermon:'主日説教',sermonFallback:'今週の主日説教をすぐにご覧いただけます。',sermonCta:'主日説教を見る →'},
  my:{daily:'နေ့စဉ် ဆင်ခြင်ခြင်း',dailyFallback:'ယနေ့ နှုတ်ကပတ်တော်ဖြင့် နေ့ကို စတင်ပါ။',dailyCta:'ယနေ့ ဆင်ခြင်ခြင်း →',sermon:'တနင်္ဂနွေ တရားဟော',sermonFallback:'ယခုအပတ် တနင်္ဂနွေ တရားဟောချက်ကို ကြည့်ပါ။',sermonCta:'တရားဟောချက် ကြည့်ရန် →'},
  kac:{daily:'Shani shagu Myit Mada',dailyFallback:'Shani na Chyum ga hte shani hpe hpaw.',dailyCta:'Shani na myit mada →',sermon:'Sunday Ga Shaga',sermonFallback:'Ndai laban na Sunday ga shaga hpe yu.',sermonCta:'Sunday ga shaga yu →'},
  vi:{daily:'Suy ngẫm hằng ngày',dailyFallback:'Bắt đầu ngày mới với Lời Chúa hôm nay.',dailyCta:'Xem suy ngẫm hôm nay →',sermon:'Bài giảng Chúa nhật',sermonFallback:'Đi thẳng đến bài giảng Chúa nhật tuần này.',sermonCta:'Xem bài giảng Chúa nhật →'},
  mn:{daily:'Өдөр тутмын бясалгал',dailyFallback:'Өнөөдрийн үгээр өдрөө эхлүүлээрэй.',dailyCta:'Өнөөдрийн бясалгал →',sermon:'Нямын номлол',sermonFallback:'Энэ долоо хоногийн Нямын номлолыг үзээрэй.',sermonCta:'Нямын номлол үзэх →'},
  id:{daily:'Renungan Harian',dailyFallback:'Mulai hari dengan firman hari ini.',dailyCta:'Buka renungan hari ini →',sermon:'Khotbah Minggu',sermonFallback:'Langsung menuju khotbah Minggu pekan ini.',sermonCta:'Buka khotbah Minggu →'}
};
let scheduled=false;
let lastLocale='';

function normalizeLocale(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='ko'||raw.startsWith('ko-'))return'ko-KR';
  if(raw==='zh'||raw.startsWith('zh-'))return'zh-CN';
  if(raw==='ja'||raw.startsWith('ja-'))return'ja';
  if(raw==='my'||raw.startsWith('my-'))return'my';
  if(raw==='kac'||raw.startsWith('kac-')||raw==='jinghpaw'||raw==='kachin')return'kac';
  if(raw==='vi'||raw.startsWith('vi-'))return'vi';
  if(raw==='mn'||raw.startsWith('mn-'))return'mn';
  if(raw==='id'||raw.startsWith('id-'))return'id';
  return'en';
}
function locale(){
  const requested=new URLSearchParams(location.search).get('lang');
  return normalizeLocale(requested||window.EKODIUserLanguage?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||'ko-KR');
}
function syncBrand(){
  const brand=document.querySelector('.site-header .brand');
  if(!brand)return;
  brand.setAttribute('href','#top');
  if(!brand.dataset.topBound){
    brand.dataset.topBound='true';
    brand.addEventListener('click',event=>{
      event.preventDefault();
      const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
      window.scrollTo({top:0,left:0,behavior});
      try{history.replaceState(null,'',location.pathname+location.search);}catch{}
    });
  }
}
function syncMusic(){
  const nav=document.querySelector('.site-header #main-nav');
  const button=document.getElementById('ekodi-ccm-mr-toggle');
  if(!nav||!button)return;
  const control=nav.querySelector('[data-ekodi-language-control]');
  if(control){
    if(button.parentElement!==nav||button.previousElementSibling!==control)control.insertAdjacentElement('afterend',button);
  }else if(button.parentElement!==nav||button!==nav.lastElementChild){
    nav.append(button);
  }
  const copy=MUSIC[locale()]||MUSIC.en;
  const active=button.getAttribute('aria-pressed')==='true';
  const label=active?copy.on:copy.off;
  const aria=active?copy.stop:copy.play;
  if(button.textContent!==label)button.textContent=label;
  if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
  if(button.title!==aria)button.title=aria;
}
function syncSchedule(){
  const rows=[...document.querySelectorAll('#worship .schedule>div')].slice(0,3);
  const data=SCHEDULE[locale()]||SCHEDULE.en;
  rows.forEach((row,index)=>{
    const values=data[index];
    if(!values)return;
    const label=row.querySelector('span');
    const time=row.querySelector('strong');
    const place=row.querySelector('small');
    if(label&&label.textContent!==values[0])label.textContent=values[0];
    if(time&&time.textContent!==values[1])time.textContent=values[1];
    if(place&&place.textContent!==values[2])place.textContent=values[2];
  });
}
function safeLocalizedText(value,fallback){
  const text=String(value||'').trim();
  if(!text)return fallback;
  if(locale()!=='ko-KR'&&/[가-힣]/.test(text))return fallback;
  return text;
}
function syncHeroFocus(){
  const root=document.querySelector('.hero-focus');
  if(!root)return;
  const copy=FOCUS[locale()]||FOCUS.en;
  const devotion=root.querySelector('.hero-focus-devotion');
  const sermon=root.querySelector('.hero-focus-sermon');
  const devotionLabel=devotion?.querySelector('.hero-focus-label');
  const devotionText=devotion?.querySelector('.hero-focus-devotion-text');
  const devotionRef=devotion?.querySelector('.hero-focus-devotion-ref');
  const sermonLabel=sermon?.querySelector('.hero-focus-label');
  const sermonText=sermon?.querySelector('.hero-focus-sermon-text');
  const sermonCta=sermon?.querySelector('.hero-focus-sermon-cta');
  const verseText=safeLocalizedText(document.querySelector('.daily-verse-text')?.textContent,copy.dailyFallback);
  const verseRef=safeLocalizedText(document.querySelector('.daily-verse-ref')?.textContent,copy.dailyCta);
  const currentSermon=safeLocalizedText(document.querySelector('.sermon-info h3')?.textContent,copy.sermonFallback);
  if(devotionLabel)devotionLabel.textContent=copy.daily;
  if(devotionText)devotionText.textContent=verseText;
  if(devotionRef)devotionRef.textContent=verseRef||copy.dailyCta;
  if(sermonLabel)sermonLabel.textContent=copy.sermon;
  if(sermonText)sermonText.textContent=currentSermon;
  if(sermonCta)sermonCta.textContent=copy.sermonCta;
  root.setAttribute('aria-label',`${copy.daily} · ${copy.sermon}`);
  if(devotion)devotion.setAttribute('aria-label',`${copy.daily}: ${verseText}`);
  if(sermon)sermon.setAttribute('aria-label',`${copy.sermon}: ${currentSermon}`);
}
function syncHeaderVerseLayout(){
  const root=document.querySelector('.site-header .daily-verse');
  const text=root?.querySelector('.daily-verse-text');
  const ref=root?.querySelector('.daily-verse-ref');
  if(!root||!text||!ref)return;
  const mobile=matchMedia('(max-width: 800px)').matches;
  const apply=(node,name,value)=>node.style.setProperty(name,value,'important');
  const clear=(node,name)=>node.style.removeProperty(name);
  const props=['position','left','right','bottom','width','max-width','min-width','transform','display','overflow','white-space','word-break','overflow-wrap','text-overflow','box-sizing','margin-top'];
  if(!mobile){
    for(const node of [root,text,ref])for(const prop of props)clear(node,prop);
    return;
  }
  apply(root,'position','absolute');
  apply(root,'left','14px');
  apply(root,'right','auto');
  apply(root,'bottom','10px');
  apply(root,'width','calc(100vw - 28px)');
  apply(root,'max-width','calc(100vw - 28px)');
  apply(root,'min-width','0');
  apply(root,'transform','none');
  apply(root,'display','block');
  apply(root,'overflow','visible');
  apply(root,'box-sizing','border-box');
  for(const node of [text,ref]){
    apply(node,'display','block');
    apply(node,'width','100%');
    apply(node,'max-width','100%');
    apply(node,'min-width','0');
    apply(node,'white-space','normal');
    apply(node,'word-break','keep-all');
    apply(node,'overflow-wrap','normal');
    apply(node,'text-overflow','clip');
    apply(node,'overflow','visible');
  }
  apply(ref,'margin-top','2px');

  const alreadyBalanced=text.querySelector('[data-ekodi-verse-line]');
  const raw=alreadyBalanced
    ? String(text.dataset.rawVerse||'').trim()
    : String(text.textContent||'').replace(/\s+/g,' ').trim();
  if(raw&&(!alreadyBalanced||text.dataset.rawVerse!==raw)){
    text.dataset.rawVerse=raw;
    const words=raw.split(' ').filter(Boolean);
    if(words.length>3){
      let best=1;
      let score=Infinity;
      for(let i=1;i<words.length;i++){
        const left=words.slice(0,i).join(' ').length;
        const right=words.slice(i).join(' ').length;
        const next=Math.abs(left-right);
        if(next<score){score=next;best=i;}
      }
      const first=document.createElement('span');
      const second=document.createElement('span');
      first.dataset.ekodiVerseLine='1';
      second.dataset.ekodiVerseLine='2';
      first.textContent=words.slice(0,best).join(' ');
      second.textContent=words.slice(best).join(' ');
      for(const line of [first,second]){
        apply(line,'display','block');
        apply(line,'white-space','nowrap');
        apply(line,'word-break','keep-all');
      }
      text.replaceChildren(first,document.createTextNode(' '),second);
    }
  }
}
function navigateForExtendedLocale(next){
  const previous=lastLocale||locale();
  lastLocale=next;
  if(next===previous||(!EXTENDED.has(next)&&!EXTENDED.has(previous)))return false;
  try{
    const url=new URL(location.href);
    url.searchParams.set('lang',next);
    location.replace(url.toString());
  }catch{location.reload();}
  return true;
}
function run(){scheduled=false;syncBrand();syncMusic();syncSchedule();syncHeroFocus();syncHeaderVerseLayout();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(run));}
lastLocale=locale();
window.addEventListener('ekodi:locale-change',event=>{
  const next=normalizeLocale(event.detail?.locale||locale());
  if(!navigateForExtendedLocale(next))schedule();
});
window.addEventListener('ekodi:user-header-ready',schedule);
window.addEventListener('ekodi:church-i18n-applied',schedule);
window.addEventListener('ekodi:church-extended-i18n-applied',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-pressed']});
})();