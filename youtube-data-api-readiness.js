// Only a numeric public Google Cloud project ID may be retained from provider errors.
export function youtubeDataApiDisabledProject(reason){
  const value=String(reason?.message||reason||'').trim();
  const coded=/^YOUTUBE_DATA_API_DISABLED(?::[0-9]{6,20})?$/i.test(value);
  const provider=/YouTube\s+Data\s+API(?:\s+v3)?/i.test(value)&&/(?:not\s+been\s+used|is\s+disabled|has\s+been\s+disabled|access\s+not\s+configured)/i.test(value);
  if(!coded&&!provider)return null;
  const match=value.match(/(?:YOUTUBE_DATA_API_DISABLED:|project\s*(?:[:=#]\s*)?)([0-9]{6,20})/i);
  return {code:'YOUTUBE_DATA_API_DISABLED',projectId:match?.[1]||''};
}
export function youtubeDataApiCloudUrl(reason){
  const info=youtubeDataApiDisabledProject(reason);
  if(!info)return '';
  return 'https://console.cloud.google.com/apis/library/youtube.googleapis.com'+(info.projectId?'?project='+info.projectId:'');
}
