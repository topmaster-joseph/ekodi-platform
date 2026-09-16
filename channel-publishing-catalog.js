const freezeFormats = formats => Object.freeze(formats.map(item => Object.freeze({...item})));

export const CHANNEL_PUBLISHING_CATALOG_VERSION = 1;

export const CHANNEL_PUBLISHING_TARGETS = Object.freeze({
  youtube: Object.freeze({
    id:'youtube', label:'YouTube', provider:'google', serviceKey:'youtube', authAdapter:'youtube', healthKey:'youtubeConfigured',
    accountHint:'Google 이메일', connectionMode:'oauth', automaticPublishing:true,
    formats:freezeFormats([
      {id:'video',label:'영상',automatic:true},
      {id:'shorts',label:'Shorts',automatic:true},
      {id:'live',label:'Live',automatic:false,note:'라이브 송출은 별도 방송 워크플로 사용'},
    ]),
  }),
  instagram: Object.freeze({
    id:'instagram', label:'Instagram', provider:'meta', serviceKey:'instagram', authAdapter:'meta', healthKey:'metaConfigured',
    accountHint:'Instagram 비즈니스/크리에이터 계정 식별자', connectionMode:'oauth', automaticPublishing:true,
    formats:freezeFormats([
      {id:'feed',label:'피드',automatic:true},
      {id:'reels',label:'Reels',automatic:true},
      {id:'stories',label:'Stories',automatic:true},
    ]),
  }),
  facebook: Object.freeze({
    id:'facebook', label:'Facebook', provider:'meta', serviceKey:'facebook', authAdapter:'meta', healthKey:'metaConfigured',
    accountHint:'Facebook Page 식별자', connectionMode:'oauth', automaticPublishing:true,
    formats:freezeFormats([
      {id:'feed',label:'피드',automatic:true},
      {id:'reels',label:'Reels',automatic:true},
    ]),
  }),
  threads: Object.freeze({
    id:'threads', label:'Threads', provider:'meta', serviceKey:'threads', authAdapter:'threads', healthKey:'threadsConfigured',
    accountHint:'Threads 계정 식별자', connectionMode:'oauth', automaticPublishing:true,
    formats:freezeFormats([
      {id:'post',label:'게시물',automatic:true},
      {id:'reply',label:'답글',automatic:false,note:'대화형 답글은 별도 승인 흐름'},
    ]),
  }),
  naver_blog: Object.freeze({
    id:'naver_blog', label:'네이버 블로그', provider:'naver', serviceKey:'blog', authAdapter:'naver', healthKey:'naverConfigured',
    accountHint:'네이버 ID / 블로그 ID', connectionMode:'official_handoff', automaticPublishing:false,
    limitation:'네이버 로그인 방식 블로그 글쓰기 Open API는 2020-05-06 종료. 공식 공유하기/수동 발행만 제공.',
    formats:freezeFormats([
      {id:'share',label:'블로그 공유',automatic:false,handoff:true},
      {id:'draft',label:'발행용 초안',automatic:false,handoff:true},
    ]),
  }),
  tiktok: Object.freeze({
    id:'tiktok', label:'TikTok', provider:'tiktok', serviceKey:'content', authAdapter:'tiktok', healthKey:'tiktokConfigured',
    accountHint:'TikTok 계정', connectionMode:'oauth', automaticPublishing:true,
    limitation:'앱 등록·Content Posting API·video.publish 승인 필요. 미감사 클라이언트는 공개범위 제한 가능.',
    formats:freezeFormats([
      {id:'video',label:'영상',automatic:true},
      {id:'photo',label:'사진',automatic:true},
      {id:'draft',label:'TikTok 초안 보내기',automatic:true},
    ]),
  }),
  kakao_channel: Object.freeze({
    id:'kakao_channel', label:'카카오톡 채널', provider:'kakao', serviceKey:'channel', authAdapter:'kakao', healthKey:'kakaoConfigured',
    accountHint:'카카오톡 채널 ID', connectionMode:'delegated_or_official_handoff', automaticPublishing:false,
    limitation:'카카오톡 채널 Open API는 채널 관계·고객관리 중심. 일반 SNS 피드 자동발행 대상으로 취급하지 않음.',
    formats:freezeFormats([
      {id:'channel',label:'채널 연결',automatic:false,handoff:true},
      {id:'message',label:'비즈메시지 연계',automatic:false,note:'별도 비즈니스 권한·계약 필요'},
    ]),
  }),
});

export const CHANNEL_PUBLISHING_TARGET_IDS = Object.freeze(Object.keys(CHANNEL_PUBLISHING_TARGETS));
export const CHANNEL_AUTOMATION_TARGET_IDS = Object.freeze(
  CHANNEL_PUBLISHING_TARGET_IDS.filter(id => CHANNEL_PUBLISHING_TARGETS[id].automaticPublishing)
);

export function channelPublishingTarget(id){
  return CHANNEL_PUBLISHING_TARGETS[String(id||'').trim().toLowerCase()] || null;
}

export function channelRegistryMapping(id){
  const target=channelPublishingTarget(id);
  return target ? {provider:target.provider,serviceKey:target.serviceKey,connectionMode:target.connectionMode} : null;
}

export function channelTargetFromRegistry(account){
  const provider=String(account?.provider||'').toLowerCase();
  const serviceKey=String(account?.serviceKey||account?.service_key||'').toLowerCase();
  const exact=CHANNEL_PUBLISHING_TARGET_IDS.find(id=>{
    const target=CHANNEL_PUBLISHING_TARGETS[id];
    return target.provider===provider&&target.serviceKey===serviceKey;
  });
  if(exact)return exact;
  if(provider==='meta'&&['meta','general','ads'].includes(serviceKey))return'facebook';
  return'';
}

export function channelTargetOptions(){
  return CHANNEL_PUBLISHING_TARGET_IDS.map(id=>{
    const target=CHANNEL_PUBLISHING_TARGETS[id];
    return {id:target.id,label:target.label,provider:target.provider,serviceKey:target.serviceKey,authAdapter:target.authAdapter,healthKey:target.healthKey,accountHint:target.accountHint,connectionMode:target.connectionMode,automaticPublishing:target.automaticPublishing,limitation:target.limitation||'',formats:target.formats.map(format=>({...format}))};
  });
}

export function channelCatalogSnapshot(platform={}){
  return channelTargetOptions().map(target=>({
    ...target,
    configured:Boolean(platform?.[target.healthKey]),
    state:target.automaticPublishing?(platform?.[target.healthKey]?'ready':'platform_setup_required'):(target.id==='naver_blog'?'official_handoff':'connection_only'),
  }));
}
