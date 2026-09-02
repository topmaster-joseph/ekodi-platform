(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined'||window.__EKODI_CCM_MR__)return;

  const script=document.currentScript;
  const surface=String(script?.dataset?.ekodiSurface||document.documentElement.dataset.ekodiUserSurface||'').trim().toLowerCase();
  const host=String(location.hostname||'').toLowerCase();
  const blockedSurface=new Set(['admin','form','document','data']);
  const blockedHost=/^(admin|auth)\./.test(host);
  if(blockedHost||blockedSurface.has(surface))return;

  window.__EKODI_CCM_MR__=true;
  const COOKIE='ekodi_ccm_mr';
  const buttonId='ekodi-ccm-mr-toggle';
  const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
  let context=null;
  let master=null;
  let compressor=null;
  let reverb=null;
  let scheduleTimer=0;
  let nextBarTime=0;
  let barIndex=0;
  let started=false;
  let wanted=true;
  let gestureArmed=false;
  const LABELS=Object.freeze({
    'ko-KR':{play:'♫ MR 재생',stop:'♫ MR 끄기',playAria:'배경 CCM MR 재생',stopAria:'배경 CCM MR 끄기'},
    en:{play:'♫ Play MR',stop:'♫ Stop MR',playAria:'Play background CCM instrumental',stopAria:'Stop background CCM instrumental'},
    'zh-CN':{play:'♫ 播放 MR',stop:'♫ 关闭 MR',playAria:'播放背景 CCM 伴奏',stopAria:'关闭背景 CCM 伴奏'},
    ja:{play:'♫ MR 再生',stop:'♫ MR 停止',playAria:'背景 CCM MR を再生',stopAria:'背景 CCM MR を停止'}
  });
  function locale(){const raw=String(window.EKODIUserLanguage?.getLocale?.()||document.documentElement.lang||'ko-KR').toLowerCase();if(raw.startsWith('en'))return'en';if(raw.startsWith('zh'))return'zh-CN';if(raw.startsWith('ja'))return'ja';return'ko-KR';}

  const progression=[
    {root:48,notes:[60,64,67]},
    {root:43,notes:[59,62,67]},
    {root:45,notes:[57,60,64]},
    {root:41,notes:[57,60,65]},
  ];
  const bpm=68;
  const beat=60/bpm;
  const bar=beat*4;

  function cookieValue(){
    const match=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`));
    return match?decodeURIComponent(match.slice(COOKIE.length+1)):'';
  }
  function remember(value){
    const secure=location.protocol==='https:'?'; Secure':'';
    document.cookie=`${COOKIE}=${encodeURIComponent(value)}; Path=/; Domain=.ekodi.kr; SameSite=Lax${secure}`;
  }
  wanted=cookieValue()!=='off';

  function midi(note){return 440*Math.pow(2,(note-69)/12);}
  function voice(freq,start,duration,level,type='sine',detune=0,destination=master){
    if(!context||!destination)return;
    const osc=context.createOscillator();
    const gain=context.createGain();
    const filter=context.createBiquadFilter();
    osc.type=type;
    osc.frequency.setValueAtTime(freq,start);
    osc.detune.setValueAtTime(detune,start);
    filter.type='lowpass';
    filter.frequency.setValueAtTime(type==='triangle'?1500:1050,start);
    filter.Q.setValueAtTime(0.25,start);
    gain.gain.setValueAtTime(0.0001,start);
    gain.gain.exponentialRampToValueAtTime(level,start+Math.min(0.9,duration*0.24));
    gain.gain.setValueAtTime(level,Math.max(start+0.06,start+duration-0.8));
    gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
    osc.connect(filter).connect(gain).connect(destination);
    osc.start(start);
    osc.stop(start+duration+0.05);
  }
  function pad(chord,start){
    chord.notes.forEach((note,index)=>{
      const level=index===0?0.026:0.021;
      voice(midi(note),start,bar*0.98,level,'sine',-4);
      voice(midi(note+12),start+0.02,bar*0.96,level*0.42,'triangle',4);
    });
  }
  function bass(chord,start){
    [0,2].forEach(beatIndex=>voice(midi(chord.root),start+beatIndex*beat,beat*1.35,0.033,'sine',0));
  }
  function arpeggio(chord,start){
    const pattern=[0,1,2,1,0,1,2,1];
    pattern.forEach((position,index)=>{
      const note=chord.notes[position]+12;
      voice(midi(note),start+index*(beat/2),beat*0.55,0.0125,'triangle',index%2?3:-3);
    });
  }
  function scheduleBar(time,index){
    const chord=progression[index%progression.length];
    pad(chord,time);
    bass(chord,time);
    arpeggio(chord,time);
  }
  function scheduler(){
    if(!context||!started)return;
    while(nextBarTime<context.currentTime+6){
      scheduleBar(nextBarTime,barIndex++);
      nextBarTime+=bar;
    }
  }
  function createImpulse(ctx){
    const length=Math.floor(ctx.sampleRate*2.2);
    const impulse=ctx.createBuffer(2,length,ctx.sampleRate);
    for(let channel=0;channel<2;channel++){
      const data=impulse.getChannelData(channel);
      for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.8);
    }
    return impulse;
  }
  function setupGraph(ctx){
    master=ctx.createGain();
    master.gain.value=0.58;
    compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-24;
    compressor.knee.value=20;
    compressor.ratio.value=5;
    compressor.attack.value=0.02;
    compressor.release.value=0.5;
    reverb=ctx.createConvolver();
    reverb.buffer=createImpulse(ctx);
    const dry=ctx.createGain();
    const wet=ctx.createGain();
    dry.gain.value=0.68;
    wet.gain.value=0.20;
    master.connect(dry).connect(compressor);
    master.connect(reverb).connect(wet).connect(compressor);
    compressor.connect(ctx.destination);
  }
  function stopAudio(){
    started=false;
    if(scheduleTimer){clearInterval(scheduleTimer);scheduleTimer=0;}
    const old=context;
    context=null;
    master=null;
    compressor=null;
    reverb=null;
    if(old&&old.state!=='closed')old.close().catch(()=>{});
    updateButton();
  }
  async function startAudio(){
    if(!wanted||started||!AudioContextCtor)return false;
    try{
      context=new AudioContextCtor();
      setupGraph(context);
      if(context.state==='suspended')await context.resume();
      if(context.state!=='running')throw new Error('audio-not-running');
      started=true;
      barIndex=0;
      nextBarTime=context.currentTime+0.08;
      scheduler();
      scheduleTimer=window.setInterval(scheduler,1800);
      updateButton();
      return true;
    }catch{
      stopAudio();
      return false;
    }
  }
  function updateButton(){
    const button=document.getElementById(buttonId);
    if(!button)return;
    const active=wanted&&started;
    const labels=LABELS[locale()]||LABELS['ko-KR'];
    button.textContent=active?labels.stop:labels.play;
    button.setAttribute('aria-pressed',active?'true':'false');
    button.setAttribute('aria-label',active?labels.stopAria:labels.playAria);
    button.title=active?labels.stopAria:labels.playAria;
  }
  function armGesture(){
    if(gestureArmed||!wanted)return;
    gestureArmed=true;
    const resume=async event=>{
      if(event?.target?.closest?.(`#${buttonId}`))return;
      const ok=await startAudio();
      if(ok){
        document.removeEventListener('pointerdown',resume,true);
        document.removeEventListener('keydown',resume,true);
        gestureArmed=false;
      }
    };
    document.addEventListener('pointerdown',resume,true);
    document.addEventListener('keydown',resume,true);
  }
  function header(){
    return document.querySelector('[data-ekodi-user-header-root]:not([data-ekodi-user-header-fallback])')||document.querySelector('[data-ekodi-user-header-root]')||document.querySelector('header[role="banner"],body > header,.site-header,.topbar,.app-header,.main-header,[data-ekodi-fixed-header]');
  }
  function actionContainer(target){
    return target?.querySelector?.('.ekodi-user-ui-fallback-header__nav,[data-ekodi-header-actions],.header-actions,.nav-actions,.top-actions,.actions,#main-nav,nav')||target;
  }
  function placeButton(button=document.getElementById(buttonId)){
    if(!button||!document.body)return;
    const target=header();
    if(!target){button.dataset.ekodiFloating='true';if(button.parentElement!==document.body)document.body.append(button);return;}
    const parent=actionContainer(target);
    button.dataset.ekodiFloating='false';
    const language=parent?.querySelector?.('[data-ekodi-language-control]');
    if(language&&language.nextElementSibling!==button)language.insertAdjacentElement('afterend',button);
    else if(button.parentElement!==parent)parent?.append(button);
  }
  function installButton(){
    if(document.getElementById(buttonId)){placeButton();return;}
    const style=document.createElement('style');
    style.dataset.ekodiCcmMr='v1';
    style.textContent=`#${buttonId}{position:static;z-index:auto;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:86px;min-height:34px;margin-inline-start:2px;padding:0 10px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:999px;background:color-mix(in srgb,var(--ekodi-user-chrome-bg,#fff) 92%,transparent);color:inherit;font:700 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:none;backdrop-filter:blur(10px);cursor:pointer;touch-action:manipulation}#${buttonId}:hover{background:color-mix(in srgb,var(--ekodi-user-chrome-bg,#fff) 98%,transparent)}#${buttonId}:focus-visible{outline:2px solid color-mix(in srgb,var(--ekodi-user-chrome-link,#2563eb) 32%,transparent);outline-offset:2px}#${buttonId}[data-ekodi-floating="true"]{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:2147482500;min-height:40px;background:rgba(255,255,255,.94);color:#0f172a;box-shadow:0 8px 24px rgba(15,23,42,.12)}@media(max-width:480px){#${buttonId}{min-width:72px;min-height:32px;padding:0 8px;font-size:11px}#${buttonId}[data-ekodi-floating="true"]{right:10px;bottom:10px;min-width:86px}}`;
    document.head.append(style);
    const button=document.createElement('button');
    button.type='button';
    button.id=buttonId;
    button.dataset.ekodiCcmMr='v1';
    button.addEventListener('click',async()=>{
      if(wanted&&started){
        wanted=false;
        remember('off');
        stopAudio();
        return;
      }
      wanted=true;
      remember('on');
      const ok=await startAudio();
      if(!ok)armGesture();
      updateButton();
    });
    document.body.append(button);
    placeButton(button);
    updateButton();
  }
  async function boot(){
    installButton();
    if(!wanted)return;
    const ok=await startAudio();
    if(!ok)armGesture();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
  window.addEventListener('ekodi:user-header-ready',()=>placeButton());
  window.addEventListener('ekodi:locale-change',()=>{updateButton();placeButton();});
  window.setTimeout(()=>placeButton(),250);
  window.setTimeout(()=>placeButton(),1200);

  document.addEventListener('visibilitychange',()=>{
    if(!context||!wanted)return;
    if(document.hidden){
      context.suspend().catch(()=>{});
    }else{
      context.resume().then(()=>{if(started)scheduler();}).catch(()=>armGesture());
    }
  });
  window.addEventListener('pagehide',stopAudio,{once:true});
})();
