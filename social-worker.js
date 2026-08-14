const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};

function json(payload,status=200,extra={}){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':status===200?'public, max-age=180':'no-store',...SECURITY_HEADERS,...extra}});
}

function withHeaders(response){
  const headers=new Headers(response.headers);
  for(const [key,value]of Object.entries(SECURITY_HEADERS))headers.set(key,value);
  if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function getRegistry(request,env){
  const assetUrl=new URL('/channels.json',request.url);
  const res=await env.ASSETS.fetch(new Request(assetUrl,{headers:{accept:'application/json'}}));
  if(!res.ok)throw new Error('channel_registry_unavailable');
  return res.json();
}

async function yt(url){
  const res=await fetch(url,{headers:{accept:'application/json'}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(body?.error?.message||`youtube_${res.status}`);
  return body;
}

function normalizePost(post,channel,orgName){
  return {...post,provider:'youtube',channelName:post.channelName||orgName||channel.label||'YouTube'};
}

async function youtubeApiPosts(channel,key,orgName){
  if(!key)return[];
  let uploads=channel.uploadsPlaylist||'';
  let channelName=orgName;
  if(!uploads){
    const handle=(channel.handle||'').replace(/^@/,'');
    if(!handle)return[];
    const channelUrl=new URL('https://www.googleapis.com/youtube/v3/channels');
    channelUrl.search=new URLSearchParams({part:'snippet,contentDetails',forHandle:handle,key}).toString();
    const channelData=await yt(channelUrl);
    const item=channelData.items?.[0];
    uploads=item?.contentDetails?.relatedPlaylists?.uploads||'';
    channelName=item?.snippet?.title||channelName;
  }
  if(!uploads)return[];
  const playlistUrl=new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  playlistUrl.search=new URLSearchParams({part:'snippet,contentDetails',playlistId:uploads,maxResults:'12',key}).toString();
  const playlist=await yt(playlistUrl);
  return(playlist.items||[]).map(row=>{
    const videoId=row.contentDetails?.videoId||row.snippet?.resourceId?.videoId||'';
    return normalizePost({
      videoId,
      title:row.snippet?.title||'YouTube',
      description:row.snippet?.description||'',
      url:videoId?`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`:channel.url,
      thumbnail:row.snippet?.thumbnails?.high?.url||row.snippet?.thumbnails?.medium?.url||row.snippet?.thumbnails?.default?.url||'',
      publishedAt:row.contentDetails?.videoPublishedAt||row.snippet?.publishedAt||'',
      channelName,
    },channel,orgName);
  }).filter(post=>post.videoId&&post.url);
}

function decodeXml(value=''){
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").trim();
}

function tag(entry,name){
  const match=entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));
  return decodeXml(match?.[1]||'');
}

async function youtubeRssPosts(channel,orgName){
  if(!channel.channelId)return[];
  const feedUrl=`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channelId)}`;
  const res=await fetch(feedUrl,{headers:{accept:'application/atom+xml,application/xml,text/xml'}});
  if(!res.ok)throw new Error(`youtube_rss_${res.status}`);
  const xml=await res.text();
  const entries=xml.match(/<entry>[\s\S]*?<\/entry>/gi)||[];
  return entries.slice(0,12).map(entry=>{
    const videoId=tag(entry,'yt:videoId');
    return normalizePost({
      videoId,
      title:tag(entry,'title')||tag(entry,'media:title')||'YouTube',
      description:tag(entry,'media:description'),
      url:videoId?`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`:channel.url,
      thumbnail:videoId?`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`:'',
      publishedAt:tag(entry,'published')||tag(entry,'updated'),
    },channel,orgName);
  }).filter(post=>post.videoId&&post.url);
}

async function youtubePosts(channel,env,orgName){
  if(env.YOUTUBE_API_KEY){
    try{
      const apiPosts=await youtubeApiPosts(channel,env.YOUTUBE_API_KEY,orgName);
      if(apiPosts.length)return {posts:apiPosts,source:'api'};
    }catch(error){console.warn('youtube api fallback',orgName,error.message);}
  }
  const rssPosts=await youtubeRssPosts(channel,orgName);
  return {posts:rssPosts,source:'rss'};
}

async function buildFeed(org,env){
  const posts=[];
  const feedSource={};
  for(const channel of org.channels||[]){
    if(channel.provider!=='youtube')continue;
    try{
      const result=await youtubePosts(channel,env,org.name);
      posts.push(...result.posts);
      feedSource.youtube=result.source;
    }catch(error){
      console.warn('youtube feed error',org.id,error.message);
      feedSource.youtube='unavailable';
    }
  }
  return {posts:posts.sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0)).slice(0,24),feedSource};
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-social',youtubeApiConfigured:Boolean(env.YOUTUBE_API_KEY),youtubeRssFallback:true},200,{'cache-control':'no-store'});
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/social',307);
    if(url.pathname==='/api/feed'){
      try{
        const registry=await getRegistry(request,env);
        const orgId=url.searchParams.get('org')||registry.organizations?.[0]?.id;
        const org=registry.organizations?.find(item=>item.id===orgId);
        if(!org)return json({error:'organization_not_found'},404);
        const {posts,feedSource}=await buildFeed(org,env);
        return json({organization:{id:org.id,name:org.name},posts,providers:[...new Set((org.channels||[]).map(ch=>ch.provider))],feedSource,youtubeApiConfigured:Boolean(env.YOUTUBE_API_KEY)});
      }catch(error){
        console.error(error);
        return json({error:'feed_unavailable'},503);
      }
    }
    return withHeaders(await env.ASSETS.fetch(request));
  }
};
