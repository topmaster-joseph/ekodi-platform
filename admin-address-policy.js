const PLATFORM_ADMIN_GROUPS=new Set(['home','operations','workspaces','services','system']);
const MALL_CANONICAL='/ekodibiz/ekodimall/admin';
const MALL_ALIASES=Object.freeze(['/admin/ekodimall','/ekodibiz/admin/ekodimall','/ekodibiz/mall/admin','/mall/admin']);
const STORE_ALIASES=Object.freeze({
  '/cmpmyi/admin/jadam':'/jadam/admin',
  '/cmpmyi/admin/pizzamaru':'/pizzamaru/admin',
  '/cmpmyi/admin/yogurt':'/yogurt/admin',
});
function clean(pathname){const value=String(pathname||'').split('?')[0].replace(/\/+$/,'');return value||'/'}
function mallSuffix(raw=''){let suffix=String(raw||'').replace(/\/+$/,'');if(suffix==='/channels'||suffix==='/marketing/channels')suffix='/channel-settings';return suffix}
const MALL_DEEP_ALIASES=Object.freeze({[`${MALL_CANONICAL}/channels`]:`${MALL_CANONICAL}/channel-settings`,[`${MALL_CANONICAL}/marketing/channels`]:`${MALL_CANONICAL}/channel-settings`});
export function canonicalSiteAdminPath(publicPath){const path=clean(publicPath);return path==='/'?'/admin':`${path}/admin`}
export function legacyAdminAliasTarget(pathname){const path=clean(pathname);if(MALL_DEEP_ALIASES[path])return MALL_DEEP_ALIASES[path];for(const prefix of MALL_ALIASES){if(path===prefix||path.startsWith(`${prefix}/`))return `${MALL_CANONICAL}${mallSuffix(path.slice(prefix.length))}`}for(const [prefix,target] of Object.entries(STORE_ALIASES)){if(path===prefix||path.startsWith(`${prefix}/`))return `${target}${path.slice(prefix.length)}`}return''}
export function isForbiddenAdminAggregationPath(pathname){return Boolean(legacyAdminAliasTarget(pathname))}
export function isPlatformAdminOwnPath(pathname){const path=clean(pathname);if(path==='/admin')return true;const m=/^\/admin\/([^/]+)(?:\/|$)/.exec(path);return Boolean(m&&PLATFORM_ADMIN_GROUPS.has(m[1]))}
export const ADMIN_ADDRESS_POLICY=Object.freeze({version:1,platformAdmin:'/admin',siteAdminPattern:'{publicPath}/admin',mallAdmin:MALL_CANONICAL,forbidAggregateAliases:true});
