const required=(value,name)=>{const text=String(value??'').trim();if(!text)throw new Error(`${name} is required`);return text};
const safe=value=>required(value,'identity segment').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
const baseKey=({batchKey,itemId,renderVersion='v1'})=>[safe(batchKey),safe(itemId),safe(renderVersion)].join('/');
const parseJson=buffer=>JSON.parse(Buffer.from(buffer).toString('utf8'));
const hashtags=value=>(Array.isArray(value)?value:[]).map(item=>String(item||'').trim()).filter(Boolean).join(' ');

export function createAssetClient({endpoint,token='',fetchImpl=fetch}){
  const base=String(endpoint||'').replace(/\/$/,'');
  return{
    ready(){return Boolean(base)},
    async get({workspace_id,asset_key}){
      if(!base){const error=new Error('asset endpoint is not configured');error.code='PUBLISHER_ASSET_STORE_DISCONNECTED';throw error}
      const url=`${base}/v1/assets/${encodeURIComponent(asset_key)}?workspace_id=${encodeURIComponent(workspace_id)}`;
      const response=await fetchImpl(url,{headers:{...(token?{authorization:`Bearer ${token}`}:{})}});
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`asset fetch failed: HTTP ${response.status}`);
      return{data:Buffer.from(await response.arrayBuffer()),mime_type:response.headers.get('content-type')||'application/octet-stream'};
    }
  };
}

export function createYoutubeApi({clientId,clientSecret,refreshTokenResolver,fetchImpl=fetch}){
  async function accessToken(configRef){
    const refreshToken=required(await refreshTokenResolver(configRef),'YouTube refresh token');
    const response=await fetchImpl('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:required(clientId,'YouTube client id'),client_secret:required(clientSecret,'YouTube client secret'),refresh_token:refreshToken,grant_type:'refresh_token'})
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok||!body.access_token)throw new Error(body?.error_description||body?.error||`OAuth refresh failed: HTTP ${response.status}`);
    return body.access_token;
  }
  async function upload({configRef,video,title,description,publishAt}){
    const token=await accessToken(configRef);
    const metadata={snippet:{title:String(title||'').slice(0,100),description:String(description||'').slice(0,5000),categoryId:'22',defaultLanguage:'ko'},status:{privacyStatus:'private',publishAt:required(publishAt,'publish_at'),selfDeclaredMadeForKids:false}};
    const init=await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=utf-8','x-upload-content-type':'video/mp4','x-upload-content-length':String(video.length)},body:JSON.stringify(metadata)
    });
    if(!init.ok)throw new Error(`YouTube upload session failed: HTTP ${init.status}`);
    const location=init.headers.get('location');
    if(!location)throw new Error('YouTube upload session returned no location');
    const uploaded=await fetchImpl(location,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'video/mp4','content-length':String(video.length)},body:video});
    const body=await uploaded.json().catch(()=>({}));
    if(!uploaded.ok||!body.id)throw new Error(body?.error?.message||`YouTube upload failed: HTTP ${uploaded.status}`);
    return{video_id:body.id,url:`https://www.youtube.com/watch?v=${body.id}`};
  }
  return{upload};
}

export function createDevotionPublisher({assets,youtube,clock=()=>new Date()}){
  if(!assets||!youtube)throw new Error('assets and youtube adapters are required');
  return{
    ready(){return Boolean(assets.ready?.())},
    async schedule({publication,target,batch}){
      const workspaceId=required(publication?.workspace_id||batch?.workspace_id,'workspace_id');
      const batchKey=required(publication?.batch_key||batch?.batch_key,'batch_key');
      const configRef=required(target?.config_ref,'target.config_ref');
      const publishAt=required(publication?.publish_at,'publish_at');
      if(Date.parse(publishAt)<=clock().getTime()){const error=new Error('publish_at must be in the future');error.code='PUBLISH_AT_NOT_FUTURE';throw error}
      const selected=new Set((publication?.item_ids||[]).map(String));
      const items=(batch?.items||[]).filter(item=>!selected.size||selected.has(String(item.id)));
      if(!items.length)throw new Error('publication items are required');
      const results=[];
      for(const item of items){
        const renderVersion=String(item.metadata?.render_version||'v1');
        const base=baseKey({batchKey,itemId:item.id,renderVersion});
        const publicationKey=`${base}/publication-${safe(target.id)}.json`;
        const [videoAsset,scriptAsset,existingPublication]=await Promise.all([
          assets.get({workspace_id:workspaceId,asset_key:`${base}/video.mp4`}),
          assets.get({workspace_id:workspaceId,asset_key:`${base}/script.json`}),
          assets.get({workspace_id:workspaceId,asset_key:publicationKey})
        ]);
        if(existingPublication){results.push({...parseJson(existingPublication.data),idempotent:true});continue}
        if(!videoAsset){const error=new Error(`video asset missing for ${item.id}`);error.code='PUBLISHER_VIDEO_MISSING';throw error}
        const draft=scriptAsset?parseJson(scriptAsset.data):{};
        const title=String(draft.publish_title||draft.title||batch.title||'매일묵상');
        const description=[String(draft.description||`${item.passage} 묵상`),hashtags(draft.hashtags)].filter(Boolean).join('\n\n');
        const uploaded=await youtube.upload({configRef,video:videoAsset.data,title,description,publishAt});
        const record={item_id:String(item.id),...uploaded,publish_at:publishAt,idempotent:false};
        if(assets.put)await assets.put({workspace_id:workspaceId,asset_key:publicationKey,data:Buffer.from(JSON.stringify(record)),mime_type:'application/json',metadata:{kind:'publication',target_id:String(target.id)}});
        results.push(record);
      }
      return{external_ref:results.length===1?results[0].video_id:JSON.stringify(results),results};
    }
  };
}
