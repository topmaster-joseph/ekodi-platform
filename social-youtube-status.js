const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_TTL = 45;
const VIDEO_ID = '[A-Za-z0-9_-]{11}';

function cleanHandle(value = '') {
  const raw = String(value).trim().replace(/^@/, '');
  return /^[A-Za-z0-9._-]{3,100}$/.test(raw) ? raw : '';
}
function cleanChannelId(value = '') {
  const raw = String(value).trim();
  return /^UC[A-Za-z0-9_-]{20,}$/.test(raw) ? raw : '';
}
function cleanVideoId(value = '') {
  const raw = String(value).trim();
  return new RegExp(`^${VIDEO_ID}$`).test(raw) ? raw : '';
}
function channelFromHtml(html = '') {
  const patterns = [
    /<meta\s+itemprop="identifier"\s+content="(UC[A-Za-z0-9_-]{20,})"/i,
    /"externalId":"(UC[A-Za-z0-9_-]{20,})"/,
    /"browseId":"(UC[A-Za-z0-9_-]{20,})"/,
  ];
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match) return cleanChannelId(match[1]);
  }
  return '';
}function publicPageStatus(html = '', now = Date.now()) {
  const text = String(html);
  const detail = text.match(new RegExp(
    `"liveBroadcastDetails":\\{([^}]*)\\}[\\s\\S]{0,1200}?"externalVideoId":"(${VIDEO_ID})"`
  ));
  if (detail) {
    const fields = detail[1];
    const videoId = cleanVideoId(detail[2]);
    const live = /"isLiveNow":true/.test(fields);
    const start = fields.match(/"startTimestamp":"([^"]+)"/)?.[1] || '';
    const end = fields.match(/"endTimestamp":"([^"]+)"/)?.[1] || '';
    const startMs = Date.parse(start);
    if (live && videoId) return {state:'live', videoId, scheduledStartTime:start, source:'public-page'};
    if (videoId && Number.isFinite(startMs) && startMs > now + 30_000) {
      return {state:'scheduled', videoId, scheduledStartTime:start, source:'public-page'};
    }
    if (videoId && (end || (Number.isFinite(startMs) && startMs <= now))) {
      return {state:'ended', videoId, scheduledStartTime:start, source:'public-page'};
    }
  }
  const contentId = text.match(new RegExp(`"contentId":"(${VIDEO_ID})","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"`))?.[1] || '';
  if (contentId) return {state:'ended', videoId:cleanVideoId(contentId), scheduledStartTime:'', source:'public-page'};
  return {state:'unavailable', videoId:'', scheduledStartTime:'', source:'public-page'};
}

async function youtubeJson(url) {
  const response = await fetch(url, {headers:{accept:'application/json'}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `youtube_${response.status}`);
  return data;
}async function resolveChannelWithApi(handle, channelId, key) {
  if (channelId) return {channelId, uploads:''};
  if (!handle || !key) return {channelId:'', uploads:''};
  const url = new URL(`${YOUTUBE_API}/channels`);
  url.search = new URLSearchParams({part:'contentDetails', forHandle:handle, key}).toString();
  const data = await youtubeJson(url);
  const item = data.items?.[0];
  return {
    channelId:cleanChannelId(item?.id || ''),
    uploads:String(item?.contentDetails?.relatedPlaylists?.uploads || ''),
  };
}
async function recentApiStatus(channelId, uploads, key, now = Date.now()) {
  if (!key || !channelId) return null;
  let playlistId = uploads;
  if (!playlistId) {
    const url = new URL(`${YOUTUBE_API}/channels`);
    url.search = new URLSearchParams({part:'contentDetails', id:channelId, key}).toString();
    const item = (await youtubeJson(url)).items?.[0];
    playlistId = String(item?.contentDetails?.relatedPlaylists?.uploads || '');
  }
  if (!playlistId) return null;
  const listUrl = new URL(`${YOUTUBE_API}/playlistItems`);
  listUrl.search = new URLSearchParams({part:'contentDetails', playlistId, maxResults:'20', key}).toString();
  const ids = (await youtubeJson(listUrl)).items?.map(v => cleanVideoId(v.contentDetails?.videoId)).filter(Boolean) || [];
  if (!ids.length) return null;
  const videoUrl = new URL(`${YOUTUBE_API}/videos`);
  videoUrl.search = new URLSearchParams({part:'snippet,liveStreamingDetails', id:ids.join(','), key}).toString();
  const videos = (await youtubeJson(videoUrl)).items || [];
  const live = videos.find(v => v.snippet?.liveBroadcastContent === 'live' || (v.liveStreamingDetails?.actualStartTime && !v.liveStreamingDetails?.actualEndTime));
  if (live) return {state:'live', videoId:cleanVideoId(live.id), scheduledStartTime:live.liveStreamingDetails?.scheduledStartTime || '', source:'api'};
  const upcoming = videos.find(v => v.snippet?.liveBroadcastContent === 'upcoming' || Date.parse(v.liveStreamingDetails?.scheduledStartTime || '') > now + 30_000);
  if (upcoming) return {state:'scheduled', videoId:cleanVideoId(upcoming.id), scheduledStartTime:upcoming.liveStreamingDetails?.scheduledStartTime || '', source:'api'};
  return null;
}async function publicStatus(handle, channelId, now = Date.now()) {
  const target = handle
    ? `https://www.youtube.com/@${encodeURIComponent(handle)}/live`
    : `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`;
  const response = await fetch(target, {
    headers:{accept:'text/html,application/xhtml+xml','user-agent':'EKODI-Social-MediaResolver/1.0'},
    redirect:'follow',
  });
  if (!response.ok) throw new Error(`youtube_public_${response.status}`);
  const html = await response.text();
  return {...publicPageStatus(html, now), channelId:channelFromHtml(html) || channelId};
}

async function resolveYouTubeStatus({handle = '', channelId = '', apiKey = '', now = Date.now()} = {}) {
  const normalizedHandle = cleanHandle(handle);
  let normalizedChannelId = cleanChannelId(channelId);
  if (!normalizedHandle && !normalizedChannelId) throw Object.assign(new Error('youtube_identity_required'), {status:400});
  let api = null;
  if (apiKey) {
    try {
      const channel = await resolveChannelWithApi(normalizedHandle, normalizedChannelId, apiKey);
      normalizedChannelId = channel.channelId || normalizedChannelId;
      api = await recentApiStatus(normalizedChannelId, channel.uploads, apiKey, now);
      if (api?.state === 'live' || api?.state === 'scheduled') return {...api, channelId:normalizedChannelId};
    } catch (error) {
      console.warn('youtube status api fallback', error?.message || error);
    }
  }
  try {
    const page = await publicStatus(normalizedHandle, normalizedChannelId, now);
    if (page.state !== 'unavailable' || !api) return page;
  } catch (error) {
    console.warn('youtube status public fallback', error?.message || error);
  }
  return {...(api || {state:'unavailable', videoId:'', scheduledStartTime:'', source:'fallback'}), channelId:normalizedChannelId};
}function statusHeaders(ttl = DEFAULT_TTL) {
  return {
    'content-type':'application/json; charset=utf-8',
    'cache-control':`public, max-age=${ttl}, stale-while-revalidate=120`,
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET, OPTIONS',
    'access-control-allow-headers':'content-type',
    'x-content-type-options':'nosniff',
  };
}
async function youtubeStatusResponse(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:statusHeaders()});
  if (request.method !== 'GET') return new Response(JSON.stringify({error:'method_not_allowed'}), {status:405, headers:statusHeaders(0)});
  const url = new URL(request.url);
  const handle = cleanHandle(url.searchParams.get('handle') || '');
  const channelId = cleanChannelId(url.searchParams.get('channelId') || url.searchParams.get('channel_id') || '');
  if (!handle && !channelId) return new Response(JSON.stringify({error:'youtube_identity_required'}), {status:400, headers:statusHeaders(0)});
  const cache = globalThis.caches?.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = new URLSearchParams({handle, channelId}).toString();
  const cacheKey = new Request(cacheUrl.toString(), {method:'GET'});
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }
  const status = await resolveYouTubeStatus({handle, channelId, apiKey:String(env.YOUTUBE_API_KEY || '')});
  const payload = {provider:'youtube', ...status, checkedAt:new Date().toISOString()};
  const ttl = status.state === 'live' ? 30 : status.state === 'scheduled' ? 45 : status.state === 'ended' ? 120 : 45;
  const response = new Response(JSON.stringify(payload), {status:200, headers:statusHeaders(ttl)});
  if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export {cleanHandle, cleanChannelId, channelFromHtml, publicPageStatus, resolveYouTubeStatus, youtubeStatusResponse};