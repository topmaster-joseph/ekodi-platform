const SOURCE_LOCALE='ko-KR';
const POLICY=Object.freeze({
  visibility:'published-only',
  sourceChange:'mark-non-source-locales-stale-and-queue-translation',
  translation:'provider-routed-internal-automation',
  validation:'key-parity-protected-token-content-safety-and-catalog-integrity',
  release:'admin-publish-after-validation',
  admin:'site-scoped-and-platform-aggregate-publication-control'
});

const LANGUAGES=Object.freeze([
  {locale:'ko-KR',aliases:['ko','ko-kr'],short:'한국어',label:'한국어',nativeName:'한국어',direction:'ltr',chrome:{language:'언어',home:'EKODI 홈',account:'사용자 계정',privacy:'개인정보처리방침',terms:'이용약관',contact:'문의',legal:'법적 고지'}},
  {locale:'en',aliases:['en','en-us','en-gb'],short:'English',label:'English',nativeName:'English',direction:'ltr',chrome:{language:'Language',home:'EKODI Home',account:'User account',privacy:'Privacy Policy',terms:'Terms of Use',contact:'Contact',legal:'Legal information'}},
  {locale:'zh-CN',aliases:['zh','zh-cn','zh-hans'],short:'中文',label:'中文',nativeName:'简体中文',direction:'ltr',chrome:{language:'语言',home:'EKODI 首页',account:'用户账户',privacy:'隐私政策',terms:'使用条款',contact:'联系',legal:'法律信息'}},
  {locale:'ja',aliases:['ja','ja-jp'],short:'日本語',label:'日本語',nativeName:'日本語',direction:'ltr',chrome:{language:'言語',home:'EKODI ホーム',account:'ユーザーアカウント',privacy:'プライバシーポリシー',terms:'利用規約',contact:'お問い合わせ',legal:'法的情報'}},
  {locale:'vi',aliases:['vi','vi-vn'],short:'Tiếng Việt',label:'Tiếng Việt',nativeName:'Tiếng Việt',direction:'ltr',chrome:{language:'Ngôn ngữ',home:'Trang chủ EKODI',account:'Tài khoản người dùng',privacy:'Chính sách quyền riêng tư',terms:'Điều khoản sử dụng',contact:'Liên hệ',legal:'Thông tin pháp lý'}},
  {locale:'ne',aliases:['ne','ne-np','nep'],short:'नेपाली',label:'नेपाली',nativeName:'नेपाली',direction:'ltr',chrome:{language:'भाषा',home:'EKODI गृह',account:'प्रयोगकर्ता खाता',privacy:'गोपनीयता नीति',terms:'प्रयोगका सर्तहरू',contact:'सम्पर्क',legal:'कानुनी जानकारी'}},
  {locale:'my',aliases:['my','my-mm','bur','mya'],short:'မြန်မာ',label:'မြန်မာ',nativeName:'မြန်မာ',direction:'ltr',chrome:{language:'ဘာသာစကား',home:'EKODI ပင်မ',account:'အသုံးပြုသူ အကောင့်',privacy:'ကိုယ်ရေးအချက်အလက် မူဝါဒ',terms:'အသုံးပြုမှု စည်းကမ်းများ',contact:'ဆက်သွယ်ရန်',legal:'ဥပဒေဆိုင်ရာ အချက်အလက်'}},
  {locale:'mn',aliases:['mn','mn-mn'],short:'Монгол',label:'Монгол',nativeName:'Монгол',direction:'ltr',chrome:{language:'Хэл',home:'EKODI нүүр',account:'Хэрэглэгчийн бүртгэл',privacy:'Нууцлалын бодлого',terms:'Үйлчилгээний нөхцөл',contact:'Холбоо барих',legal:'Хууль зүйн мэдээлэл'}},
  {locale:'id',aliases:['id','id-id','in'],short:'Bahasa',label:'Bahasa Indonesia',nativeName:'Bahasa Indonesia',direction:'ltr',chrome:{language:'Bahasa',home:'Beranda EKODI',account:'Akun pengguna',privacy:'Kebijakan Privasi',terms:'Ketentuan Penggunaan',contact:'Kontak',legal:'Informasi hukum'}}
]);
const STAGES=Object.freeze({
  source:{labelKo:'기본',labelEn:'Source',public:true,order:0},
  queued:{labelKo:'번역대기',labelEn:'Queued',public:false,order:10},
  translating:{labelKo:'번역중',labelEn:'Translating',public:false,order:20},
  validating:{labelKo:'검증중',labelEn:'Validating',public:false,order:30},
  'release-ready':{labelKo:'게시준비',labelEn:'Release ready',public:false,order:40},
  published:{labelKo:'번역완료',labelEn:'Translation ready',public:true,order:50},
  stale:{labelKo:'원문변경',labelEn:'Source changed',public:false,order:60},
  blocked:{labelKo:'보류',labelEn:'Blocked',public:false,order:70}
});

const PUBLICATION_STATES=Object.freeze({
  published:Object.freeze({labelKo:'게시',labelEn:'Published',public:true}),
  hidden:Object.freeze({labelKo:'비게시',labelEn:'Hidden',public:false})
});

const PUBLISHED=Object.freeze({
  ekodi:Object.freeze(['ko-KR','en','zh-CN','ja']),
  cgma:Object.freeze(['ko-KR','en']),
  biz:Object.freeze(['ko-KR','en','zh-CN','ja','vi','ne']),
  journal:Object.freeze(['ko-KR','en','zh-CN','ja','vi'])
});

const normalizeId=value=>String(value||'').trim().toLowerCase();
const byLocale=new Map(LANGUAGES.map(language=>[language.locale,language]));
const aliases=new Map();
for(const language of LANGUAGES){
  aliases.set(language.locale.toLowerCase(),language.locale);
  for(const alias of language.aliases||[])aliases.set(String(alias).toLowerCase(),language.locale);
}

export function normalizePlatformLocale(value){return aliases.get(String(value||'').trim().toLowerCase())||'';}
export function languageForLocale(value){return byLocale.get(normalizePlatformLocale(value))||null;}
export function publishedLocalesForService(serviceId){
  const id=normalizeId(serviceId);
  return Object.freeze([...(PUBLISHED[id]||[SOURCE_LOCALE])]);
}

export function languageStatesForService(serviceId){
  const published=new Set(publishedLocalesForService(serviceId));
  return LANGUAGES.map(language=>{
    const status=language.locale===SOURCE_LOCALE?'source':published.has(language.locale)?'published':'queued';
    return Object.freeze({
      locale:language.locale,
      label:language.label,
      nativeName:language.nativeName,
      status,
      publicationStatus:STAGES[status].public?'published':'hidden',
      public:STAGES[status].public,
      publicationLabelKo:PUBLICATION_STATES[STAGES[status].public?'published':'hidden'].labelKo,
      stageLabelKo:STAGES[status].labelKo,
      stageLabelEn:STAGES[status].labelEn
    });
  });
}

export function siteLanguageStatus(service){
  const id=normalizeId(service?.id||service);
  const name=service?.name||service?.shortName||(id==='ekodi'?'EKODI':id);
  const url=service?.url||(id==='ekodi'?'https://ekodi.kr/':'');
  const languages=languageStatesForService(id);
  const published=languages.filter(item=>item.public).map(item=>item.locale);
  return Object.freeze({
    id,name,url,
    sourceLocale:SOURCE_LOCALE,
    publishedLocales:Object.freeze(published),
    multilingual:published.length>1,
    automation:Object.freeze({changeDetection:'automatic',translation:'automatic',validation:'automatic',release:'validation-gated'}),
    languages:Object.freeze(languages)
  });
}

export function languageStatusSnapshot(services=[]){
  const root=siteLanguageStatus({id:'ekodi',name:'EKODI',url:'https://ekodi.kr/'});
  const sites=[root,...services.filter(service=>service?.id!=='ekodi').map(siteLanguageStatus)];
  return Object.freeze({schemaVersion:2,registryVersion:2,sourceLocale:SOURCE_LOCALE,policy:POLICY,languages:LANGUAGES,stages:STAGES,publicationStates:PUBLICATION_STATES,sites:Object.freeze(sites)});
}

export function renderLanguageRegistryBootstrap(){
  const browser={
    version:1,
    sourceLocale:SOURCE_LOCALE,
    policy:{visibility:POLICY.visibility},
    languages:LANGUAGES.map(language=>({
      locale:language.locale,
      aliases:language.aliases,
      short:language.short,
      label:language.label,
      nativeName:language.nativeName,
      direction:language.direction,
      chrome:language.chrome
    }))
  };
  return `window.__EKODI_LANGUAGE_REGISTRY__=${JSON.stringify(browser).replace(/</g,'\\u003c')};`;
}

export const EKODI_LANGUAGE_REGISTRY=Object.freeze({
  version:2,
  sourceLocale:SOURCE_LOCALE,
  policy:POLICY,
  languages:LANGUAGES,
  stages:STAGES,
  publicationStates:PUBLICATION_STATES,
  published:PUBLISHED
});
