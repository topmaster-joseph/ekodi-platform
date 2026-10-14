// Google OAuth consent proves the token holder selected an accessible YouTube channel.
// In explicit Brand Account mode, refuse zero or multiple channels and always bind
// the server-authorized channel ID to the registered EKODI account. No email spoofing.
export function selectAuthorizedYouTubeChannels(response,{brandAccountMode=false,registryConnectionId=''}={}){
  const channels=(Array.isArray(response?.items)?response.items:[]).filter(channel=>channel&&typeof channel.id==='string'&&channel.id.trim());
  if(!channels.length)throw new Error('YOUTUBE_CHANNEL_NOT_FOUND');
  if(brandAccountMode&&(!String(registryConnectionId||'').trim()||channels.length!==1))throw new Error('YOUTUBE_BRAND_CHANNEL_AMBIGUOUS');
  return channels;
}
