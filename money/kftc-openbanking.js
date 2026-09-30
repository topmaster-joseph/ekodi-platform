export const KFTC_OPENBANKING=Object.freeze({
  providerId:'kftc-openbanking',
  canonicalRedirectUri:'https://ekodi.kr/money/oauth/kftc/callback',
  authorizeUrl:'https://openapi.openbanking.or.kr/oauth/2.0/authorize',
  tokenUrl:'https://openapi.openbanking.or.kr/oauth/2.0/token',
  balanceInquiryUrl:'https://openapi.openbanking.or.kr/v2.0/account/balance/fin_num',
  transactionHistoryUrl:'https://openapi.openbanking.or.kr/v2.0/account/transaction_list/fin_num',
  initialReadScopes:Object.freeze(['inquiry'])
});
const enabled=value=>String(value||'').toLowerCase()==='true';
export function normalizeKftcApprovedReadScopes(value=''){
  const requested=String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
  const allowed=new Set(KFTC_OPENBANKING.initialReadScopes);
  return [...new Set(requested.filter(scope=>allowed.has(scope)))];
}
export function kftcOpenBankingReadiness(env={}){
  const contractApproved=enabled(env.KFTC_OPENBANKING_CONTRACT_APPROVED);
  const featureEnabled=enabled(env.KFTC_OPENBANKING_ENABLED);
  const clientConfigured=Boolean(String(env.KFTC_OPENBANKING_CLIENT_ID||'').trim());
  const redirectUri=String(env.KFTC_OPENBANKING_REDIRECT_URI||'').trim();
  const redirectConfigured=redirectUri===KFTC_OPENBANKING.canonicalRedirectUri;
  const oauthStateStoreReady=enabled(env.OAUTH_STATE_STORE_READY);
  const tokenEncryptionReady=enabled(env.TOKEN_ENCRYPTION_READY);
  const consentStoreReady=enabled(env.CONSENT_STORE_READY);
  const approvedReadScopes=normalizeKftcApprovedReadScopes(env.KFTC_OPENBANKING_APPROVED_READ_SCOPES);
  const adapterConnected=Boolean(env.KFTC_OPENBANKING_ADAPTER&&typeof env.KFTC_OPENBANKING_ADAPTER.fetch==='function');
  const configurationReady=featureEnabled&&contractApproved&&clientConfigured&&redirectConfigured&&oauthStateStoreReady&&tokenEncryptionReady&&consentStoreReady&&approvedReadScopes.length>0;
  return Object.freeze({
    featureEnabled,contractApproved,clientConfigured,redirectConfigured,oauthStateStoreReady,
    tokenEncryptionReady,consentStoreReady,approvedReadScopes,configurationReady,
    adapterConnected,readReady:configurationReady&&adapterConnected,
    transferReady:false,canonicalRedirectUri:KFTC_OPENBANKING.canonicalRedirectUri
  });
}
