import { localRegionForestPublicScript } from './local-region-forest-public.js';
import { localRegionForestAdminScript } from './local-region-forest-admin.js';
import { localRegionAdminAuthScript } from './local-region-admin-auth.js';
import { localRegionAccessAdminScript } from './local-region-access-admin.js';
import { localRegionOperationsAdminScript } from './local-region-operations-admin.js';
import { tenantAdminCommandHomeScript, tenantAdminCommandHomeCss } from './tenant-admin-command-home.js';
import { storeAdminCss, storeAdminScript } from './store-admin-engine.js';
import { organizationAdminCss, organizationAdminScript } from './organization-admin-page.js';
import { workspaceAdminCss, workspaceAdminScript } from './workspace-admin-page.js';
import { workspaceTradeAdminScript } from './workspace-trade-admin-page.js';
import { churchPastorAdminScript } from './church-pastor-admin-page.js';
import { tradePartnerCss, tradePartnerScript } from './workspace-trade-portal.js';

const STATIC_ASSET_HANDLERS=new Map([
  ['/cheonggye/local-region-admin-auth.js',localRegionAdminAuthScript],
  ['/cheonggye/local-region-access-admin.js',localRegionAccessAdminScript],
  ['/cheonggye/local-region-operations-admin.js',localRegionOperationsAdminScript],
  ['/cheonggye/local-region-forest-public.js',localRegionForestPublicScript],
  ['/cheonggye/local-region-forest-admin.js',localRegionForestAdminScript],
  ['/tenant-admin-command-home.css',tenantAdminCommandHomeCss],
  ['/tenant-admin-command-home.js',tenantAdminCommandHomeScript],
  ['/store-admin.css',storeAdminCss],
  ['/jadam-admin.css',storeAdminCss],
  ['/pizzamaru-admin.css',storeAdminCss],
  ['/yogurt-admin.css',storeAdminCss],
  ['/store-admin.js',storeAdminScript],
  ['/jadam-admin.js',storeAdminScript],
  ['/pizzamaru-admin.js',storeAdminScript],
  ['/yogurt-admin.js',storeAdminScript],
  ['/organization-admin.css',organizationAdminCss],
  ['/organization-admin.js',organizationAdminScript],
  ['/workspace-admin.css',workspaceAdminCss],
  ['/workspace-admin.js',workspaceAdminScript],
  ['/workspace-trade-admin.js',workspaceTradeAdminScript],
  ['/church-pastor-admin.js',churchPastorAdminScript],
  ['/workspace-trade-portal.css',tradePartnerCss],
  ['/workspace-trade-portal.js',tradePartnerScript],
]);

export const PLATFORM_ROUTER_STATIC_ASSET_PATHS=Object.freeze([...STATIC_ASSET_HANDLERS.keys()]);

export function routePlatformStaticAsset(pathname){
  const handler=STATIC_ASSET_HANDLERS.get(String(pathname||''));
  return handler?handler():null;
}
