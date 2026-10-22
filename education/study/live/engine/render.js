// Shared DOM-string rendering for Instructor Studio, Presenter and Learner Lab.
// Every value is escaped; no inline styles or handlers (Education CSP: style-src/script-src 'self').
import {buildPrompts,missionContext,missionMaterials,levelById,trackById,KIND_LABELS} from './model.js';
import {FACTCHAT_FEATURES,FEATURE_STATUS,featureById} from '../tools/factchat.js';

export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const list=(items,ordered=false,cls='')=>'<'+(ordered?'ol':'ul')+(cls?' class="'+cls+'"':'')+'>'+(items||[]).map(t=>'<li>'+esc(t)+'</li>').join('')+'</'+(ordered?'ol':'ul')+'>';
export const multiline=text=>esc(text).replace(/\n/g,'<br>');

const FEATURE_KEY='ekodi_edu_live_features_v1';
export function readFeatureChecks(storage){try{const raw=JSON.parse(storage?.getItem(FEATURE_KEY)||'{}');return raw&&typeof raw==='object'?raw:{};}catch{return {};}}
export function writeFeatureCheck(storage,id,status){
  if(!featureById(id))return false;
  const all=readFeatureChecks(storage);
  if(status==='needs-verification')delete all[id];else all[id]={status,at:Date.now()};
  try{storage?.setItem(FEATURE_KEY,JSON.stringify(all));return true;}catch{return false;}
}
export function featureStatus(checks,id){const s=checks?.[id]?.status;return FEATURE_STATUS[s]?s:'needs-verification';}
export function featureBadge(checks,id){
  const status=featureStatus(checks,id),meta=FEATURE_STATUS[status];
  return '<span class="badge badge-'+meta.tone+'">'+esc(meta.label)+'</span>';
}
export function featureCard(checks,id,{controls=false}={}){
  const f=featureById(id);if(!f)return '';
  const status=featureStatus(checks,id);
  return '<article class="feature" data-feature="'+esc(f.id)+'"><header><h4>'+esc(f.label)+'</h4>'+featureBadge(checks,id)+'</header>'+
    '<p class="feature-where"><b>위치</b> '+esc(f.where)+'</p><p>'+esc(f.summary)+'</p>'+
    '<p class="meta">크레딧: '+esc(f.credit)+(f.pcOnly?' · <b>PC 전용</b>':'')+'</p>'+
    '<p class="meta"><a href="'+esc(f.docUrl)+'" target="_blank" rel="noopener noreferrer">공식 문서</a> · 문서 기준일 '+esc(f.docAsOf)+'</p>'+
    (controls?'<div class="seg" role="group" aria-label="'+esc(f.label)+' 현장 확인">'+
      ['confirmed-local','unavailable-local','needs-verification'].map(s=>'<button type="button" class="seg-btn'+(status===s?' is-on':'')+'" data-feature-check="'+esc(f.id)+'" data-status="'+s+'" aria-pressed="'+(status===s)+'">'+esc(s==='confirmed-local'?'확인됨':s==='unavailable-local'?'사용 불가':'미확인')+'</button>').join('')+'</div>':'')+
    '</article>';
}
export const allFeatureIds=()=>FACTCHAT_FEATURES.map(f=>f.id);

export function promptBlock(p,id){
  return '<div class="prompt"><div class="prompt-head"><strong>'+esc(p.label)+'</strong><button type="button" class="btn btn-small" data-copy="'+esc(id)+'">복사</button></div>'+
    '<pre class="prompt-text" id="'+esc(id)+'" tabindex="0">'+esc(p.text)+'</pre></div>';
}
export function promptBlocks(course,missionId,trackId,levelId,idPrefix=''){
  return buildPrompts(course,missionId,trackId,levelId).map((p,i)=>promptBlock(p,idPrefix+'prompt-'+i)).join('');
}

// The 10-part mission structure shared by the Learner Lab and the instructor preview.
export function missionSections(course,missionId,{trackId,levelId,checks,tool,showFallback=false,checked={},idPrefix=''}={}){
  const m=course.missions[missionId];if(!m)return '<p>미션을 찾을 수 없습니다.</p>';
  const ctx=missionContext(course,missionId,trackId);
  const level=levelById(course,levelId);
  const source=ctx.source||ctx.script||ctx.facts||'';
  const materials=missionMaterials(course,missionId,trackId);
  const features=m.features.map(id=>{const f=featureById(id);return f?'<li><b>'+esc(f.label)+'</b> — '+esc(f.where)+' '+featureBadge(checks,id)+'</li>':'';}).join('');
  const ideas=missionId==='free'&&ctx.ideas.length?'<h4>'+esc(ctx.label)+' 추천 과제</h4>'+list(ctx.ideas):'';
  const crit=m.criteria[level.id].map((c,i)=>{const key=missionId+':'+level.id+':'+i;return '<label class="check"><input type="checkbox" data-crit="'+esc(key)+'"'+(checked[key]?' checked':'')+'> <span>'+esc(c)+'</span></label>';}).join('');
  const errs=m.errors.map((c,i)=>{const key=missionId+':err:'+i;return '<label class="check"><input type="checkbox" data-crit="'+esc(key)+'"'+(checked[key]?' checked':'')+'> <span>'+esc(c)+'</span></label>';}).join('');
  return [
    sec(1,'무엇을 해결하나요?','<p>'+esc(m.problem)+'</p>'),
    sec(2,'왜 필요한가요?','<p>'+esc(m.why)+'</p>'),
    sec(3,'사용할 FactChat 기능','<ul class="feature-list">'+features+'</ul>'+(tool?'<p><a class="btn btn-primary" href="'+esc(tool.entryUrl)+'" target="_blank" rel="noopener noreferrer" data-open-tool="factchat">FactChat 열기 ↗</a> <span class="meta">공식 사이트에서 본인이 직접 로그인합니다. EKODI는 계정 정보를 받지 않습니다.</span></p>':'')),
    sec(4,'준비할 자료',list(m.prepare)+(source?'<div class="source"><p class="source-label">'+esc(ctx.label)+' · '+esc(ctx.doc||ctx.meeting||ctx.topic||'')+'</p><pre class="source-text">'+esc(source)+'</pre></div>':'')+ideas+
      (materials.length?'<div class="downloads">'+materials.map((f,i)=>'<button type="button" class="btn btn-ghost btn-small" data-download="'+i+'">⬇ '+esc(f.label)+'</button>').join('')+'</div>':'')),
    sec(5,'따라 하기',list(m.steps,true,'steps')),
    sec(6,'복사 가능한 프롬프트 · '+esc(level.label),'<p class="meta">'+esc(level.hint)+'</p>'+promptBlocks(course,missionId,trackId,level.id,idPrefix)),
    sec(7,'예상 결과 예시','<p>'+esc(m.expected)+'</p>'),
    sec(8,'검증해야 하는 오류','<div class="checks">'+errs+'</div>'),
    sec(9,'최종 결과물 · 달성 조건','<p><b>'+esc(m.deliverable)+'</b></p><div class="checks">'+crit+'</div>'),
    sec(10,'내 업무에 적용하기','<p>'+esc(m.apply)+'</p>'),
    '<section class="fallback'+(showFallback?' is-open':'')+'" aria-labelledby="fb-'+esc(missionId)+'"><h3 id="fb-'+esc(missionId)+'">'+esc(m.fallback.title)+'</h3><p class="meta">FactChat 접속·기능 사용이 어려울 때 같은 학습목표로 진행합니다.</p>'+list(m.fallback.steps,true)+(m.fallback.sampleOutput?'<pre class="source-text">'+esc(m.fallback.sampleOutput)+'</pre>':'')+'</section>'
  ].join('');
}
function sec(no,title,body){return '<section class="msec"><h3><span class="msec-no">'+no+'</span>'+title+'</h3>'+body+'</section>';}

// Absolute https media (e.g. official video stills) is used as-is; package assets are resolved against assetBase.
function mediaSrc(src,assetBase){return /^https:/.test(src)?src:assetBase+src}
export function instructorCard(ins,assetBase='',{compact=false}={}){
  if(!ins)return '';
  const sites=ins.sites.map(x=>'<a class="site-chip" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(x.label)+'</b>'+(compact?'':'<span>'+esc(x.desc)+'</span>')+'</a>').join('');
  const gallery=ins.gallery?.length?'<div class="ins-gallery" aria-label="강사 활동">'+ins.gallery.map(g=>{const img='<img src="'+esc(mediaSrc(g.src,assetBase))+'" alt="'+esc(g.alt)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="360">';
    return '<figure>'+(g.href?'<a href="'+esc(g.href)+'" target="_blank" rel="noopener noreferrer" title="영상 보기 (새 창)">'+img+'<span class="ins-play" aria-hidden="true">▶</span></a>':img)+'<figcaption>'+esc(g.caption)+'</figcaption></figure>'}).join('')+'</div>':'';
  const detail='<p class="meta">'+esc(ins.promise)+'</p>'+list(ins.roles,false,'ins-roles')+'<p class="meta">저서 · '+ins.books.map(b=>'『'+esc(b)+'』').join(' ')+'</p>';
  return '<section class="ins-card'+(compact?' is-compact':'')+'" aria-label="오늘의 강사 소개"><img class="ins-photo" src="'+esc(assetBase+ins.photo)+'" alt="'+esc(ins.photoAlt)+'" width="160" height="160" loading="lazy">'+
    '<div class="ins-body"><p class="eyebrow">오늘의 강사</p><h2 class="ins-name">'+esc(ins.name)+' <span>'+esc(ins.nameEn)+'</span></h2><p class="ins-headline">'+esc(ins.headline)+'</p>'+
    '<p class="ins-hook">'+esc(ins.hook)+'</p>'+(compact
      // Learner lab: the same short card in every session; the full profile folds out on demand.
      ?'<div class="site-chips" aria-label="운영 웹사이트">'+sites+'</div>'+
        '<details class="ins-more"><summary>강사 소개 더 보기 · 경력·저서·활동</summary>'+detail+gallery+'</details>'
      :detail+'<div class="site-chips" aria-label="운영 웹사이트">'+sites+'</div>'+gallery)+'</div></section>';
}
export function slideHtml(slide,{joinSvg='',joinUrl='',timerText='',sessionLabel='',instructor=null,assetBase=''}={}){
  if(!slide)return '';
  const head='<p class="slide-kicker">'+esc(slide.k)+'</p><h2 class="slide-title">'+esc(slide.t)+'</h2>';
  if(slide.special==='instructor'&&instructor){
    const ins=instructor;
    return '<div class="slide slide-ins"><img class="slide-ins-photo" src="'+esc(assetBase+ins.photo)+'" alt="'+esc(ins.photoAlt)+'"><div class="slide-ins-text">'+
      '<p class="slide-kicker">'+esc(slide.k)+'</p><h2 class="slide-title">'+esc(ins.name)+' <span class="slide-ins-en">'+esc(ins.nameEn)+'</span></h2>'+
      '<p class="slide-lead">'+esc(ins.headline)+'</p>'+list(ins.roles.slice(0,3),false,'slide-bullets slide-ins-roles')+
      '<p class="slide-ins-sites">'+ins.sites.slice(0,4).map(x=>'<span>'+esc(x.label)+'</span>').join('')+'</p>'+
      (ins.gallery?.length?'<p class="slide-ins-gallery">'+ins.gallery.slice(0,3).map(g=>'<img src="'+esc(mediaSrc(g.src,assetBase))+'" alt="'+esc(g.alt)+'" referrerpolicy="no-referrer" decoding="async">').join('')+'</p>':'')+
      '<p class="slide-ins-hook">'+esc(ins.hook)+'</p></div></div>';
  }
  if(slide.special==='hook'){
    return '<div class="slide slide-hook"><p class="slide-kicker">'+esc(slide.k)+'</p><h2 class="slide-hook-q">'+esc(slide.t)+'</h2><p class="slide-lead">'+esc(slide.p)+'</p></div>';
  }
  if(slide.special==='tracks'){
    return '<div class="slide slide-tracks">'+head+(slide.p?'<p class="slide-lead">'+esc(slide.p)+'</p>':'')+'<ol class="slide-track-grid">'+(slide.tracks||[]).map(t=>'<li><b>'+esc(t.label)+'</b><span>'+esc(t.task)+'</span></li>').join('')+'</ol></div>';
  }
  if(slide.special==='outcomes'){
    return '<div class="slide slide-outcomes">'+head+'<ol class="slide-outcome-list">'+(slide.bullets||[]).map(b=>'<li>'+esc(b)+'</li>').join('')+'</ol></div>';
  }
  if(slide.special==='join'){
    return '<div class="slide slide-join">'+'<div class="slide-join-text">'+head+(slide.p?'<p class="slide-lead">'+esc(slide.p)+'</p>':'')+(slide.bullets?.length?list(slide.bullets,false,'slide-bullets'):'')+
      '<p class="slide-url">'+esc(joinUrl)+'</p></div><div class="slide-qr">'+joinSvg+'</div></div>';
  }
  if(slide.special==='break'){
    return '<div class="slide slide-break">'+head+'<p class="slide-lead">'+esc(slide.p)+'</p>'+(timerText?'<p class="slide-timer" data-slide-timer>'+esc(timerText)+'</p>':'')+'</div>';
  }
  if(slide.special==='hunt'){
    return '<div class="slide slide-hunt">'+head+'<pre class="slide-pre">'+esc(slide.p)+'</pre>'+list(slide.bullets,false,'slide-bullets')+'</div>';
  }
  return '<div class="slide">'+head+(slide.p?'<p class="slide-lead">'+esc(slide.p)+'</p>':'')+(slide.bullets?.length?list(slide.bullets,false,'slide-bullets'):'')+(sessionLabel?'<p class="slide-foot">'+esc(sessionLabel)+'</p>':'')+'</div>';
}

export function moduleLabel(mod){return mod.start+'–'+mod.end+'분 · '+(KIND_LABELS[mod.kind]||'');}
export {trackById,levelById};

export function downloadText(doc,name,text,mime='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob(['﻿'+text],{type:mime}));
  const a=doc.createElement('a');a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export async function copyText(win,text,fallbackEl){
  try{
    if(!win.navigator.clipboard||!win.isSecureContext)throw new Error('clipboard unavailable');
    await win.navigator.clipboard.writeText(text);return 'copied';
  }catch{
    if(fallbackEl){
      const range=win.document.createRange();range.selectNodeContents(fallbackEl);
      const sel=win.getSelection();sel.removeAllRanges();sel.addRange(range);
      try{if(win.document.execCommand&&win.document.execCommand('copy'))return 'copied';}catch{}
      return 'selected';
    }
    return 'failed';
  }
}
export function safeStorage(win){
  try{const s=win.localStorage;const k='__ekodi_probe__';s.setItem(k,'1');s.removeItem(k);return s;}catch{return null;}
}
export function safeChannel(win,name){try{return typeof win.BroadcastChannel==='function'?new win.BroadcastChannel(name):null;}catch{return null;}}

// Measures the sticky top bar and fixed dock so nothing overlaps; works whether or not the EKODI Shell
// later adopts the top bar as its fixed header (it then inserts its own spacer of the same height).
export function bindChrome(doc,{top=null,dock=null}={}){
  const root=doc.body;
  const apply=()=>{
    if(top)root.style.setProperty('--lv-top-h',Math.ceil(top.getBoundingClientRect().height)+'px');
    root.style.setProperty('--lv-dock-h',dock&&!dock.hidden?Math.ceil(dock.getBoundingClientRect().height)+'px':'0px');
  };
  apply();
  const RO=doc.defaultView?.ResizeObserver;
  if(typeof RO==='function'){const ro=new RO(apply);if(top)ro.observe(top);if(dock)ro.observe(dock);}
  doc.defaultView?.addEventListener('resize',apply);
  return apply;
}

// Opens — or brings back to the front — the official FactChat site in its own tab for a live demo.
// Link-out only: FactChat is never framed (institutional login, third-party cookies, its own CSP).
// A new tab starts at about:blank (same origin) so the opener link is cut before it navigates to FactChat.
export function showFactchatTab(win,url,name='ekodi-factchat-demo'){
  let w=null;
  try{w=win.open('',name);}catch{w=null;}
  if(!w)return {ok:false,fresh:false};
  let fresh=false;
  try{fresh=w.location.href==='about:blank';}catch{fresh=false;}
  if(fresh){try{w.opener=null;}catch{}w.location.replace(url);}
  try{w.focus();}catch{}
  return {ok:true,fresh};
}
// The Learner Lab URL the presenter stage embeds for a demo: same origin, no timer pointer (stable src).
export function embeddedLabUrl(joinUrl){
  const u=new URL(joinUrl);u.searchParams.delete('e');u.searchParams.set('embed','1');return u.toString();
}
