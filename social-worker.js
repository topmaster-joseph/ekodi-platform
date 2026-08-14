const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};

function json(payload,status=200,extra={}){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':status===200?'public, max-age=180':'no-store',...SECURITY_HEADERS,...extra}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const [key,value]of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function getRegistry(request,env){const assetUrl=new URL('/channels.json',request.url);const res=await env.ASSETS.fetch(new Request(assetUrl,{headers:{accept:'application/json'}}));if(!res.ok)throw new Error('channel_registry_unavailable');return res.json()}
async function yt(url){const res=await fetch(url,{headers:{accept:'application/json'}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body?.error?.message||`youtube_${res.status}`);return body}
async function youtubePosts(channel,key){
  const handle=(channel.handle||'').replace(/^@/,'');
  if(!handle||!key)return[];
  const channelUrl=new URL('https://www.googleapis.com/youtube/v3/channels');
  channelUrl.search=new URLSearchParams({part:'snippet,contentDetails',forHandle:handle,key}).toString();
  const channelData=await yt(channelUrl);
  const item=channelData.items?.[0];
  const uploads=item?.contentDetails?.relatedPlaylists?.uploads;
  if(!uploads)return[];
  const playlistUrl=new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  playlistUrl.search=new URLSearchParams({part:'snippet,contentDetails',playlistId:uploads,maxResults:'9',key}).toString();
  const playlist=await yt(playlistUrl);
  return (playlist.items||[]).map(row=>{
    const videoId=row.contentDetails?.videoId||row.snippet?.resourceId?.videoId;
    return {provider:'youtube',title:row.snippet?.title||'YouTube',description:row.snippet?.description||'',url:videoId?`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`:channel.url,thumbnail:row.snippet?.thumbnails?.high?.url||row.snippet?.thumbnails?.medium?.url||row.snippet?.thumbnails?.default?.url||'',publishedAt:row.contentDetails?.videoPublishedAt||row.snippet?.publishedAt||'',channelName:item?.snippet?.title||channel.label||'YouTube'};
  }).filter(post=>post.url);
}
async function buildFeed(org,env){
  const posts=[];
  for(const channel of org.channels||[]){
    if(channel.provider==='youtube'){
      try{posts.push(...await youtubePosts(channel,env.YOUTUBE_API_KEY))}catch(error){console.warn('youtube feed error',org.id,error.message)}
    }
  }
  return posts.sort((a,b)=>new Date(b.publishedAt||0)-new Date(a.publishedAt||0)).slice(0,18);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return json({ok:true,service:'ekodi-social',youtubeConfigured:Boolean(env.YOUTUBE_API_KEY)},200,{'cache-control':'no-store'});
    if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/social',307);
    if(url.pathname==='/api/feed'){
      try{
        const registry=await getRegistry(request,env);
        const orgId=url.searchParams.get('org')||registry.organizations?.[0]?.id;
        const org=registry.organizations?.find(item=>item.id===orgId);
        if(!org)return json({error:'organization_not_found'},404);
        const posts=await buildFeed(org,env);
        return json({organization:{id:org.id,name:org.name},posts,providers:[...new Set((org.channels||[]).map(ch=>ch.provider))],youtubeConfigured:Boolean(env.YOUTUBE_API_KEY)});
      }catch(error){console.error(error);return json({error:'feed_unavailable'},503)}
    }
    return withHeaders(await env.ASSETS.fetch(request));
  }
};
