(()=>{
'use strict';
if(window.__EKODI_CHURCH_MEMBER_I18N_BOOTED)return;
window.__EKODI_CHURCH_MEMBER_I18N_BOOTED=true;

const LANGUAGES=Object.freeze([
  ['ko-KR','한국어'],['en','English'],['zh-CN','中文'],['ja','日本語'],
  ['my','မြန်မာ'],['kac','Jinghpaw'],['vi','Tiếng Việt'],['mn','Монгол'],['id','Bahasa']
]);
const VALUES=new Set(LANGUAGES.map(([value])=>value));
const STORAGE_KEY='ekodi_user_locale';
const MAP=Object.freeze({
  '에코디교회':{en:'EKODI Church','zh-CN':'EKODI教会',ja:'EKODI教会',my:'EKODI Church',kac:'EKODI Nawku Htingnu',vi:'Hội thánh EKODI',mn:'EKODI Сүм',id:'Gereja EKODI'},
  '사이트 도구':{en:'Site tools','zh-CN':'站点工具',ja:'サイトツール',my:'Site tools',kac:'Site tools',vi:'Công cụ trang',mn:'Сайтын хэрэгсэл',id:'Alat situs'},
  '교회에서 필요한 것을 한곳에서 확인합니다.':{en:'Find what you need for church in one place.','zh-CN':'在一个页面查看教会所需内容。',ja:'教会で必要なものを一か所で確認できます。',my:'Find what you need for church in one place.',kac:'Nawku Htingnu a lam ni hpe shara langai hta yu.',vi:'Xem những gì bạn cần cho hội thánh tại một nơi.',mn:'Сүмд хэрэгтэй зүйлсээ нэг дороос харна.',id:'Temukan kebutuhan gereja di satu tempat.'},
  '예배와 말씀, 공동체 활동, 실시간 연결을 교회 안에서 바로 찾습니다.':{en:'Find worship, the Word, community life, and live connections inside the church site.','zh-CN':'在教会站点内直接查看礼拜、话语、群体活动和实时连接。',ja:'礼拝、みことば、共同体活動、ライブ接続を教会サイト内ですぐ確認できます。',my:'Find worship, the Word, community life, and live connections inside the church site.',kac:'Nawku, Mungga, hpung lam hte live matut mahkai hpe site hta sha tam.',vi:'Tìm thờ phượng, Lời Chúa, sinh hoạt cộng đồng và kết nối trực tiếp ngay trong trang hội thánh.',mn:'Мөргөл, Үг, хамтын амьдрал, шууд холболтыг сүмийн сайтаас олно.',id:'Temukan ibadah, Firman, kegiatan komunitas, dan koneksi langsung di situs gereja.'},
  '로그인 상태를 확인하고 있습니다.':{en:'Checking sign-in status.','zh-CN':'正在确认登录状态。',ja:'ログイン状態を確認しています。',my:'Checking sign-in status.',kac:'Sign-in status hpe yu nga ai.',vi:'Đang kiểm tra trạng thái đăng nhập.',mn:'Нэвтрэлтийн төлөвийг шалгаж байна.',id:'Memeriksa status masuk.'},
  'Google 계정으로 로그인':{en:'Sign in with Google','zh-CN':'使用Google账号登录',ja:'Googleアカウントでログイン',my:'Sign in with Google',kac:'Google hte sign in',vi:'Đăng nhập bằng Google',mn:'Google-ээр нэвтрэх',id:'Masuk dengan Google'},
  '교회 바로가기':{en:'Church shortcuts','zh-CN':'教会快捷入口',ja:'教会ショートカット',my:'Church shortcuts',kac:'Nawku shortcut',vi:'Lối tắt hội thánh',mn:'Сүмийн товчлол',id:'Pintasan gereja'},
  '예배':{en:'Worship','zh-CN':'礼拜',ja:'礼拝',my:'Worship',kac:'Nawku',vi:'Thờ phượng',mn:'Мөргөл',id:'Ibadah'},
  '다음 예배와 말씀 흐름을 확인합니다.':{en:'Check the next worship and message flow.','zh-CN':'查看下一次礼拜和信息安排。',ja:'次の礼拝とメッセージの流れを確認します。',my:'Check the next worship and message flow.',kac:'Next nawku hte mungga hpe yu.',vi:'Xem lịch thờ phượng và sứ điệp tiếp theo.',mn:'Дараагийн мөргөл ба номлолын урсгалыг харна.',id:'Lihat ibadah dan alur firman berikutnya.'},
  '오늘의 삶':{en:'Today','zh-CN':'今日生活',ja:'今日の生活',my:'Today',kac:'Dai ni',vi:'Hôm nay',mn:'Өнөөдөр',id:'Hari ini'},
  '말씀을 오늘의 삶과 연결합니다.':{en:'Connect the Word with today’s life.','zh-CN':'把话语与今天的生活连接起来。',ja:'みことばを今日の生活につなげます。',my:'Connect the Word with today’s life.',kac:'Mungga hpe dai ni asak hte matut.',vi:'Kết nối Lời Chúa với đời sống hôm nay.',mn:'Үгийг өнөөдрийн амьдралтай холбоно.',id:'Hubungkan Firman dengan kehidupan hari ini.'},
  '공동체 활동':{en:'Community life','zh-CN':'群体活动',ja:'共同体活動',my:'Community life',kac:'Hpung lam',vi:'Sinh hoạt cộng đồng',mn:'Хамтын амьдрал',id:'Kegiatan komunitas'},
  '함께하는 모임과 활동을 확인합니다.':{en:'Check gatherings and activities together.','zh-CN':'查看共同参与的聚会和活动。',ja:'ともに行う集まりと活動を確認します。',my:'Check gatherings and activities together.',kac:'Rau nga ai gathering hte activity hpe yu.',vi:'Xem các buổi gặp gỡ và hoạt động chung.',mn:'Хамтын уулзалт, үйл ажиллагааг харна.',id:'Lihat pertemuan dan kegiatan bersama.'},
  '실시간 연결':{en:'Live connection','zh-CN':'实时连接',ja:'ライブ接続',my:'Live connection',kac:'Live matut',vi:'Kết nối trực tiếp',mn:'Шууд холболт',id:'Koneksi langsung'},
  '예배와 모임 방송에 참여합니다.':{en:'Join worship and gathering broadcasts.','zh-CN':'参加礼拜和聚会直播。',ja:'礼拝や集会の配信に参加します。',my:'Join worship and gathering broadcasts.',kac:'Nawku hte gathering live hta shang lawm.',vi:'Tham gia phát sóng thờ phượng và nhóm họp.',mn:'Мөргөл, уулзалтын дамжуулалтад оролцоно.',id:'Ikuti siaran ibadah dan pertemuan.'},
  '나의 헌금':{en:'My giving','zh-CN':'我的奉献',ja:'私の献金',my:'My giving',kac:'Nye giving',vi:'Dâng hiến của tôi',mn:'Миний өргөл',id:'Persembahan saya'},
  '본인 헌금내역과 기부금영수증 요청을 확인합니다.':{en:'Check your giving history and donation-receipt requests.','zh-CN':'查看本人奉献记录和捐赠收据申请。',ja:'ご本人の献金履歴と寄付金領収書の申請を確認します。',my:'Check your giving history and donation-receipt requests.',kac:'Nang a giving history hte receipt request hpe yu.',vi:'Xem lịch sử dâng hiến và yêu cầu biên nhận.',mn:'Өргөлийн түүх болон баримтын хүсэлтийг харна.',id:'Lihat riwayat persembahan dan permintaan kuitansi.'},
  '내 정보와 참여 서비스는 필요한 범위에서만 연결합니다.':{en:'Your information and participating services are connected only as needed.','zh-CN':'您的信息和参与服务仅在必要范围内连接。',ja:'個人情報と参加サービスは必要な範囲だけ連携します。',my:'Your information and participating services are connected only as needed.',kac:'Nang a data hte service ni hpe ra ai daram sha matut.',vi:'Thông tin và dịch vụ tham gia chỉ được kết nối trong phạm vi cần thiết.',mn:'Таны мэдээлэл болон оролцох үйлчилгээг зөвхөн шаардлагатай хэмжээнд холбоно.',id:'Informasi dan layanan Anda hanya dihubungkan sesuai kebutuhan.'},
  '로그인 사용자':{en:'Signed-in user','zh-CN':'已登录用户',ja:'ログインユーザー',my:'Signed-in user',kac:'Sign-in user',vi:'Người dùng đã đăng nhập',mn:'Нэвтэрсэн хэрэглэгч',id:'Pengguna masuk'},
  '{email} 계정으로 연결되어 있습니다.':{en:'Connected with {email}.','zh-CN':'已连接账号 {email}。',ja:'{email} アカウントで接続されています。',my:'Connected with {email}.',kac:'{email} hte matut da ai.',vi:'Đã kết nối bằng tài khoản {email}.',mn:'{email} бүртгэлээр холбогдсон.',id:'Terhubung dengan akun {email}.'},
  '교회 마이페이지를 개인 계정과 연결하려면 로그인해 주세요.':{en:'Sign in to connect this church page with your account.','zh-CN':'请登录以将此教会页面连接到您的个人账号。',ja:'この教会マイページを個人アカウントに接続するにはログインしてください。',my:'Sign in to connect this church page with your account.',kac:'Nawku page hpe account hte matut na sign in galaw.',vi:'Đăng nhập để kết nối trang hội thánh này với tài khoản của bạn.',mn:'Энэ сүмийн хуудсыг бүртгэлтэйгээ холбохын тулд нэвтэрнэ үү.',id:'Masuk untuk menghubungkan halaman gereja ini dengan akun Anda.'}
});

let active='ko-KR';
let applying=false;
const textState=new WeakMap();
const attrState=new WeakMap();

function normalize(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='ko'||raw.startsWith('ko-'))return'ko-KR';
  if(raw==='en'||raw.startsWith('en-'))return'en';
  if(raw==='zh'||raw.startsWith('zh-'))return'zh-CN';
  if(raw==='ja'||raw.startsWith('ja-'))return'ja';
  if(raw==='my'||raw.startsWith('my-'))return'my';
  if(raw==='kac'||raw.startsWith('kac-')||raw==='jinghpaw')return'kac';
  if(raw==='vi'||raw.startsWith('vi-'))return'vi';
  if(raw==='mn'||raw.startsWith('mn-'))return'mn';
  if(raw==='id'||raw.startsWith('id-'))return'id';
  return'ko-KR';
}
function interpolate(value,vars={}){return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g,(_,key)=>String(vars[key]??`{${key}}`));}
function t(source,vars={}){
  const key=String(source??'');
  if(active==='ko-KR')return interpolate(key,vars);
  return interpolate(MAP[key]?.[active]||key,vars);
}
function initialLocale(){
  const query=new URLSearchParams(location.search).get('lang');
  if(query)return normalize(query);
  try{const stored=localStorage.getItem(STORAGE_KEY);if(stored)return normalize(stored);}catch{}
  return'ko-KR';
}
function persist(locale){
  try{localStorage.setItem(STORAGE_KEY,locale);}catch{}
  try{document.cookie=`ekodi_locale=${encodeURIComponent(locale)}; Domain=.ekodi.kr; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;}catch{}
}
function ensureControl(){
  const nav=document.querySelector('[data-ekodi-header-actions]');
  if(!nav)return null;
  let control=nav.querySelector('[data-ekodi-language-control]');
  if(!control){
    control=document.createElement('label');
    control.className='ekodi-user-language';
    control.dataset.ekodiLanguageControl='member-v1';
    control.setAttribute('aria-label','Language');
    const select=document.createElement('select');
    select.className='ekodi-user-language__select';
    select.setAttribute('aria-label','Language');
    for(const [value,label] of LANGUAGES){
      const option=document.createElement('option');option.value=value;option.textContent=label;option.title=label;select.append(option);
    }
    select.addEventListener('change',()=>{
      const next=normalize(select.value);
      persist(next);
      const url=new URL(location.href);url.searchParams.set('lang',next);location.assign(url.toString());
    });
    control.append(select);nav.append(control);
  }
  const select=control.querySelector('select');
  if(select&&select.value!==active)select.value=active;
  return control;
}
function translateTextNode(node){
  const parent=node.parentElement;
  if(!parent||parent.closest('script,style,template,noscript,[data-ekodi-language-control]'))return;
  const raw=String(node.nodeValue||'');
  let state=textState.get(node);
  if(!state){state={source:raw,last:raw};textState.set(node,state);}
  else if(raw!==state.last){state.source=raw;state.last=raw;}
  const source=state.source.trim();if(!source)return;
  const translated=t(source);if(translated===source&&active!=='ko-KR')return;
  const lead=state.source.match(/^\s*/)?.[0]||'',tail=state.source.match(/\s*$/)?.[0]||'';
  const next=`${lead}${translated}${tail}`;if(node.nodeValue!==next)node.nodeValue=next;state.last=next;
}
function translateAttr(el,name){
  if(!el.hasAttribute(name)||el.closest('[data-ekodi-language-control]'))return;
  const raw=el.getAttribute(name)||'';
  let map=attrState.get(el);if(!map){map=new Map();attrState.set(el,map);}
  let state=map.get(name);if(!state){state={source:raw,last:raw};map.set(name,state);}else if(raw!==state.last){state.source=raw;state.last=raw;}
  const next=t(state.source.trim());if(next!==state.source.trim())el.setAttribute(name,next);state.last=el.getAttribute(name)||'';
}
function apply(locale=active){
  applying=true;active=normalize(locale);document.documentElement.lang=active;document.documentElement.dataset.ekodiLocale=active;persist(active);ensureControl();
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))translateTextNode(node);
  document.querySelectorAll('[aria-label],[title],[placeholder]').forEach(el=>{translateAttr(el,'aria-label');translateAttr(el,'title');translateAttr(el,'placeholder');});
  applying=false;window.dispatchEvent(new CustomEvent('ekodi:church-member-locale-change',{detail:{locale:active}}));
}
function schedule(){if(applying)return;requestAnimationFrame(()=>apply(active));}

active=initialLocale();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(active),{once:true});else apply(active);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
window.EKODIChurchMemberI18n=Object.freeze({getLocale:()=>active,setLocale:apply,t});
})();