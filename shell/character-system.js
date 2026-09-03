(()=>{
'use strict';
if(window.__EKODI_CHARACTER_SYSTEM_BOOTED)return;
window.__EKODI_CHARACTER_SYSTEM_BOOTED=true;
const current=document.currentScript;
const service=String(current?.dataset?.ekodiService||document.documentElement.dataset.ekodiService||'ekodi').trim().toLowerCase()||'ekodi';
const surface=String(current?.dataset?.ekodiSurface||document.documentElement.dataset.ekodiUserSurface||'public').trim().toLowerCase();
const API='https://shell.ekodi.kr/character/manifest';
const ALLOWED=new Set(['public','workspace']);
const DEFAULTS=['welcome','guide','community','business','current'].map((name,index)=>({id:`bundled-${name}`,kind:'generated',filename:`${name}.webp`,isActive:index===0,assetUrl:`https://shell.ekodi.kr/character-assets/${name}.webp`}));
function hash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0;}
function placement(){
  if(service==='ekodi')return {mode:'hero',side:'right',size:'large'};
  const business=new Set(['business','biz','marketing','management','trade','invest','mall']);
  const community=new Set(['church','community','bible','education','life']);
  if(business.has(service))return {mode:'edge',side:'right',size:'medium',mood:'present'};
  if(community.has(service))return {mode:'edge',side:'left',size:'medium',mood:'welcome'};
  return {mode:'edge',side:(hash(service)%2?'right':'left'),size:'small',mood:'guide'};
}
function choose(manifest){const variants=Array.isArray(manifest?.variants)&&manifest.variants.length?manifest.variants:DEFAULTS;if(manifest?.active&&variants.length===0)return {...manifest.active,assetUrl:manifest.assetUrl};return variants[hash(`${service}:${location.pathname}`)%variants.length]||DEFAULTS[0];}
function resolvedAssetUrl(value){const url=String(value||'');if(location.hostname!=='ekodi.kr')return url;return url.replace('https://shell.ekodi.kr/character-assets/','/character-assets/').replace('https://shell.ekodi.kr/character/','/api/public/character/');}
function mount(asset){
  if(!asset?.assetUrl||document.querySelector('[data-ekodi-character]'))return;
  const spec=placement();
  const host=document.createElement('aside');host.dataset.ekodiCharacter='v1';host.dataset.service=service;host.dataset.mode=spec.mode;host.dataset.side=spec.side;host.dataset.size=spec.size;host.dataset.mood=spec.mood||'welcome';host.setAttribute('aria-label','EKODI 캐릭터 안내');
  const img=document.createElement('img');img.src=resolvedAssetUrl(asset.assetUrl);img.alt='EKODI 안내 캐릭터';img.loading=service==='ekodi'?'eager':'lazy';img.decoding='async';
  host.append(img);
  if(spec.mode==='hero'){
    const hero=document.querySelector('.hero,.hero-section,[data-hero],main>section');
    if(hero){hero.dataset.ekodiCharacterHost='true';hero.append(host);}else document.body.append(host);
  }else document.body.append(host);
  window.dispatchEvent(new CustomEvent('ekodi:character-ready',{detail:{service,assetId:asset.id,...spec}}));
}
async function boot(){
  if(!ALLOWED.has(surface)||document.documentElement.dataset.ekodiCharacter==='off')return;
  try{const response=await fetch(API,{cache:'no-store',mode:'cors'});if(!response.ok)return;mount(choose(await response.json()));}catch{}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
