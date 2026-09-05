(()=>{
'use strict';
if(window.__EKODI_MEDIA_MEETING_ADAPTER_BOOTED)return;
window.__EKODI_MEDIA_MEETING_ADAPTER_BOOTED=true;
const VERSION=1;
const JITSI_LANGUAGE=Object.freeze({'ko-KR':'ko',ko:'ko',en:'en','zh-CN':'zhCN',ja:'ja',vi:'vi',ne:'en'});
const COPY=Object.freeze({
  'ko-KR':{scheduled:'다음 방송을 준비하고 있습니다',ended:'최근 방송과 다시보기를 확인하세요',unavailable:'현재 이 페이지에서 영상을 재생할 수 없습니다',open:'YouTube에서 확인하기 ↗'},
  en:{scheduled:'Preparing the next broadcast',ended:'Watch the latest broadcast or replay',unavailable:'This video cannot be played on this page right now',open:'Open on YouTube ↗'},
  'zh-CN':{scheduled:'下一场直播正在准备中',ended:'查看最近的直播或回放',unavailable:'当前无法在此页面播放该视频',open:'前往 YouTube 查看 ↗'},
  ja:{scheduled:'次の配信を準備しています',ended:'最新の配信・アーカイブを見る',unavailable:'現在このページでは動画を再生できません',open:'YouTubeで確認 ↗'},
  vi:{scheduled:'Đang chuẩn bị buổi phát tiếp theo',ended:'Xem chương trình mới nhất hoặc phát lại',unavailable:'Hiện không thể phát video trên trang này',open:'Xem trên YouTube ↗'},
  ne:{scheduled:'अर्को प्रसारणको तयारी भइरहेको छ',ended:'पछिल्लो प्रसारण वा पुनःप्रसारण हेर्नुहोस्',unavailable:'अहिले यो पृष्ठमा भिडियो चलाउन सकिँदैन',open:'YouTube मा हेर्नुहोस् ↗'}
});
const STYLE_ID='ekodi-media-meeting-adapter-style';
function normalizeLocale(value){const lower=String(value||'').trim().toLowerCase();if(lower==='ko'||lower.startsWith('ko-'))return'ko-KR';if(lower==='zh'||lower.startsWith('zh-'))return'zh-CN';if(lower==='ja'||lower.startsWith('ja-'))return'ja';if(lower==='vi'||lower.startsWith('vi-'))return'vi';if(lower==='ne'||lower.startsWith('ne-'))return'ne';return'en';}
function locale(){return normalizeLocale(window.EKODIUserLanguage?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||navigator.language);}
function installStyle(){if(document.getElementById(STYLE_ID))return;const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`[data-ekodi-media-provider="youtube"] .ekodi-media-state{min-height:220px;display:grid;place-items:center;padding:28px;text-align:center;background:#111;color:#fff}[data-ekodi-media-provider="youtube"] .ekodi-media-state__inner{max-width:460px}[data-ekodi-media-provider="youtube"] .ekodi-media-state__label{display:block;margin-bottom:10px;font-size:11px;font-weight:850;letter-spacing:.12em;opacity:.7}[data-ekodi-media-provider="youtube"] .ekodi-media-state__message{margin:0 0 18px;font-size:clamp(16px,2.5vw,22px);font-weight:800;line-height:1.45}[data-ekodi-media-provider="youtube"] .ekodi-media-state__link{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:9px 16px;border:1px solid rgba(255,255,255,.36);border-radius:999px;color:#fff!important;text-decoration:none;font-weight:750}[data-ekodi-media-provider="youtube"] iframe{width:100%;height:100%;min-height:220px;border:0}`;(document.head||document.documentElement).append(style);}
function jitsiSrc(frame){const room=String(frame.dataset.ekodiRoom||'').trim();if(!room)return'';const base=String(frame.dataset.ekodiMeetingBase||'https://meet.jit.si').replace(/\/+$/,'');const language=JITSI_LANGUAGE[locale()]||'en';return `${base}/${encodeURIComponent(room)}#config.prejoinConfig.enabled=true&config.defaultLanguage=${encodeURIComponent(language)}`;}
function syncJitsi(){for(const frame of document.querySelectorAll('iframe[data-ekodi-meeting-provider="jitsi"]')){const next=jitsiSrc(frame);if(next&&frame.src!==next)frame.src=next;frame.lang=locale();}}
function copy(){return COPY[locale()]||COPY.en;}
function youtubeEmbedUrl(videoId){return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=0&rel=0`;}
function renderYouTube(root,override={}){if(!root)return;const state=String(override.state||root.dataset.ekodiMediaState||'scheduled').toLowerCase();const videoId=String(override.videoId||root.dataset.ekodiVideoId||'').trim();const channelUrl=String(override.channelUrl||root.dataset.ekodiChannelUrl||'https://www.youtube.com/').trim();if(override.state)root.dataset.ekodiMediaState=state;if(override.videoId!==undefined)root.dataset.ekodiVideoId=videoId;if((state==='live'||state==='ended')&&videoId){const title=String(root.dataset.ekodiMediaTitle||'YouTube');root.innerHTML=`<iframe src="${youtubeEmbedUrl(videoId)}" title="${title.replace(/"/g,'&quot;')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>`;return;}const c=copy();const key=state==='ended'?'ended':state==='unavailable'||state==='live'?'unavailable':'scheduled';root.innerHTML=`<div class="ekodi-media-state" data-ekodi-media-fallback="${key}"><div class="ekodi-media-state__inner"><span class="ekodi-media-state__label">YOUTUBE</span><p class="ekodi-media-state__message">${c[key]}</p><a class="ekodi-media-state__link" href="${channelUrl}" target="_blank" rel="noopener noreferrer">${c.open}</a></div></div>`;}
function syncYouTube(){for(const root of document.querySelectorAll('[data-ekodi-media-provider="youtube"]'))renderYouTube(root);}
function refresh(){installStyle();syncJitsi();syncYouTube();}
function updateYouTube(target,state){const root=typeof target==='string'?document.querySelector(target):target;if(root)renderYouTube(root,state||{});}
window.EKODIMediaMeetingAdapter=Object.freeze({version:VERSION,refresh,updateYouTube});
window.addEventListener('ekodi:locale-change',refresh);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})();