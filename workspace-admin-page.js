Warning: truncated output (original token count: 79901)
Total output lines: 1754

import { isWorkspaceAdminPathShape } from './workspace-route-policy.js';
import { tenantAdminMetricsTabsCss, mountTenantAdminMetricsTabs } from './tenant-admin-metrics-tabs.js';
import { CHURCH_ADMIN_MENU, mountChurchAdminNavigation, CHURCH_ADMIN_NAV_CSS } from './church-admin-navigation.js';
import { renderMallSocialSetup } from './mall-social-setup.js';
import { youtubeDataApiDisabledProject, youtubeDataApiCloudUrl } from './youtube-data-api-readiness.js';
import { TENANT_ADMIN_CAPABILITIES, tenantAdminPolicySnapshot } from './tenant-admin-policy.js';
import { ekodiBizAdminScopeSnapshot } from './ekodibiz-admin-registry.js';
import { channelTargetOptions } from './channel-publishing-catalog.js';
import {renderTenantServiceAdmin,TENANT_SERVICE_CSS} from './tenant-service-admin-ui.js';
import {mountTenantNotificationMetrics} from './tenant-notification-admin-ui.js';
import {TENANT_AUTOMATION_CSS,tenantAutomationOverviewModel,tenantAutomationOverviewHtml,bindTenantAutomationOverview} from './tenant-automation-overview-ui.js';
import {confirmTenantServicePreference} from './tenant-service-setting-verification.js';

const WORKSPACE_SECTION_CAPABILITY=Object.freeze({
  root:Object.freeze({services:TENANT_ADMIN_CAPABILITIES.site,chrome:TENANT_ADMIN_CAPABILITIES.site,design:TENANT_ADMIN_CAPABILITIES.site,languages:TENANT_ADMIN_CAPABILITIES.language,overview:TENANT_ADMIN_CAPABILITIES.dashboard,'business-center':TENANT_ADMIN_CAPABILITIES.operations,activities:TENANT_ADMIN_CAPABILITIES.activities,saturday:TENANT_ADMIN_CAPABILITIES.activities,mall:TENANT_ADMIN_CAPABILITIES.dashboard,mail:TENANT_ADMIN_CAPABILITIES.connections,publishing:TENANT_ADMIN_CAPABILITIES.marketing,marketing:TENANT_ADMIN_CAPABILITIES.marketing,work:TENANT_ADMIN_CAPABILITIES.operations,finance:TENANT_ADMIN_CAPABILITIES.finance,tax:TENANT_ADMIN_CAPABILITIES.finance,confirmations:TENANT_ADMIN_CAPABILITIES.confirmations,members:TENANT_ADMIN_CAPABILITIES.access,member:TENANT_ADMIN_CAPABILITIES.memberRoster,festival:TENANT_ADMIN_CAPABILITIES.access,edocs:TENANT_ADMIN_CAPABILITIES.access,applications:TENANT_ADMIN_CAPABILITIES.access,booths:TENANT_ADMIN_CAPABILITIES.access,'market-oversight':TENANT_ADMIN_CAPABILITIES.operations,petitions:TENANT_ADMIN_CAPABILITIES.access,'ip-archive':TENANT_ADMIN_CAPABILITIES.access,'education-survey':TENANT_ADMIN_CAPABILITIES.operations,status:TENANT_ADMIN_CAPABILITIES.logs,records:TENANT_ADMIN_CAPABILITIES.reports}),
  mall:Object.freeze({services:TENANT_ADMIN_CAPABILITIES.site,design:TENANT_ADMIN_CAPABILITIES.site,languages:TENANT_ADMIN_CAPABILITIES.language,overview:TENANT_ADMIN_CAPABILITIES.dashboard,sales:TENANT_ADMIN_CAPABILITIES.sales,products:TENANT_ADMIN_CAPABILITIES.catalog,sourcing:TENANT_ADMIN_CAPABILITIES.supplyNetwork,marketing:TENANT_ADMIN_CAPABILITIES.marketing,channels:TENANT_ADMIN_CAPABILITIES.marketing,automation:TENANT_ADMIN_CAPABILITIES.marketing,growth:TENANT_ADMIN_CAPABILITIES.marketing,analytics:TENANT_ADMIN_CAPABILITIES.sales,confirmations:TENANT_ADMIN_CAPABILITIES.confirmations}),
});
export function workspaceAdminCanAccess(role,section,service='root'){const key=service==='mall'?'mall':'root';const capability=WORKSPACE_SECTION_CAPABILITY[key][String(section||'overview').toLowerCase()];if(!capability)return false;const policy=tenantAdminPolicySnapshot();const allowed=policy.roleCapabilities[String(role||'').trim().toLowerCase()]||[];return allowed.includes('*')||allowed.includes(capability);}
export function workspaceAdminSectionsForRole(role,service='root'){const key=service==='mall'?'mall':'root';return Object.keys(WORKSPACE_SECTION_CAPABILITY[key]).filter(section=>workspaceAdminCanAccess(role,section,key));}

const CSS=`.access-filter-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 6px;padding:0;border-bottom:1px solid #e1e7ef}.access-filter-tab{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:8px 12px;border:1px solid transparent;border-bottom:2px solid transparent;border-radius:8px 8px 0 0;background:transparent;color:#596579;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.access-filter-tab strong{font-variant-numeric:tabular-nums;font-size:12px}.access-filter-tab[aria-pressed="true"]{background:#eef3fa;border-color:#d7e0ed;border-bottom-color:#1f3c88;color:#173b7a;font-weight:800}.access-filter-tab:focus-visible{outline:2px solid #1f3c88;outline-offset:2px}#summaryCards[hidden],#mainPanel tr[hidden],#memberFilterEmpty[hidden]{display:none!important}#memberFilterEmpty{margin:10px 0;font-size:12px;color:#64748b}@media(max-width:620px){.access-filter-tabs{gap:4px}.access-filter-tab{flex:1 1 calc(50% - 4px);padding:8px 5px;min-height:42px}}`+`.meeting-form textarea{width:100%;min-height:82px;padding:9px 10px;border:1px solid #dce3ee;border-radius:8px;font:inherit;color:#172033;background:#fff}.meeting-form .trade-grid label{align-content:start}@media(max-width:700px){.meeting-form .trade-grid{grid-template-columns:1fr}}.admin-scope-switcher{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:-4px 0 10px;padding:0;background:transparent}.admin-scope-switcher[hidden]{display:none!important}.admin-scope-label{font-size:11px;font-weight:800;color:#7d8796;white-space:nowrap}.admin-scope-select{min-width:210px;min-height:36px;border:1px solid #dfe5ee;border-radius:9px;background:#fff;color:#334155;padding:7px 34px 7px 10px;font:inherit;font-size:12px;font-weight:700}.admin-scope-select:focus{outline:2px solid #cfe0f5;outline-offset:1px}.sidebar .admin-scope-switcher{position:static;display:grid;justify-content:stretch;gap:5px;flex:0 0 auto;margin:0 0 8px;padding:7px;border:0;border-bottom:1px solid #edf0f5;background:transparent;min-width:0}.sidebar .admin-scope-select{width:100%;min-width:0;max-width:100%;min-height:42px;font-size:13px}.sidebar .admin-scope-label{font-size:11px;word-break:keep-all}.admin-nav-subitems{display:grid;gap:1px;padding:3px 0 5px 12px}.admin-nav-subitems-label{padding:5px 9px 3px;font-size:11px;color:#667085;font-weight:800;word-break:keep-all}.sidebar nav .admin-nav-subitems a{font-size:12px;min-height:32px;word-break:keep-all}@media(max-width:860px){.admin-scope-switcher{position:sticky;top:0;z-index:18;margin:0 -12px 10px;padding:8px 12px;border-bottom:1px solid #e1e7ef;background:#fff}.admin-scope-label{margin-right:auto}.admin-scope-select{min-width:0;max-width:66vw;min-height:42px;font-size:13px}}.design-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.design-field{display:grid;gap:6px;padding:12px;border:1px solid #e6eaf1;border-radius:10px;background:#fafbfc}.design-field label,.design-field strong{font-size:12px}.design-field select{min-height:40px;border:1px solid #dce3ee;border-radius:8px;background:#fff;padding:8px 10px}.design-preview{display:grid;grid-template-columns:80px 1fr;gap:14px;align-items:center;margin-top:14px;padding:14px;border:1px solid #e6eaf1;border-radius:12px;background:linear-gradient(135deg,#fff,#f5f7fb)}.design-swatch{width:72px;height:72px;border-radius:18px;background:var(--preview-accent,#315d48);box-shadow:inset 0 0 0 10px color-mix(in srgb,var(--preview-accent,#315d48) 18%,white)}.design-note{font-size:11px;color:#718096;line-height:1.6}.design-live-preview{margin-top:14px;border:1px solid #e1e7ef;border-radius:12px;background:#f8fafc;overflow:hidden}.design-preview-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #e1e7ef;background:#fff}.design-preview-devices{display:flex;gap:6px;flex-wrap:wrap}.design-preview-devices button{border:1px solid #dce3ee;background:#fff;border-radius:8px;padding:6px 9px;font-size:11px;cursor:pointer}.design-preview-devices button.active{background:#1f3c88;color:#fff;border-color:#1f3c88}.design-frame-shell{padding:14px;overflow:auto;text-align:center}.design-frame{display:block;margin:0 auto;width:100%;height:520px;border:1px solid #cfd8e5;border-radius:10px;background:#fff;transition:width .18s ease}.design-frame[data-device="tablet"]{width:min(820px,100%)}.design-frame[data-device="mobile"]{width:min(390px,100%);height:640px}.design-frame iframe{width:100%;height:100%;border:0;background:#fff}@media(max-width:700px){.design-grid{grid-template-columns:1fr}.design-preview{grid-template-columns:56px 1fr}.design-swatch{width:52px;height:52px;border-radius:14px}}`+`:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f5f7fb;color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f5f7fb;color:#172033}.topbar{display:none;height:58px;align-items:center;gap:16px;padding:0 22px;background:#fff;border-bottom:1px solid #e6eaf1;position:sticky;top:0;z-index:20}.brand{font-weight:800;color:#172033;text-decoration:none;letter-spacing:.06em}.context{display:flex;align-items:center;gap:8px;min-width:0}.context strong{font-size:14px}.context span{font-size:12px;color:#718096;padding-left:8px;border-left:1px solid #dfe5ee}.public-link{margin-left:auto;text-decoration:none;color:#374151;font-size:13px;padding:8px 11px;border:1px solid #dfe5ee;border-radius:9px}.layout{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100dvh;padding:8px 10px;background:#fff;border-right:1px solid #e6eaf1;display:flex;flex-direction:column;overflow:hidden}.scope{display:none}.scope span{display:block;color:#8a94a6;font-size:11px}.scope strong{display:block;margin-top:3px;font-size:14px}.sidebar nav{display:grid;gap:1px;overflow-y:auto;overflow-x:hidden;flex:1 1 auto;min-height:0;padding-right:2px;scrollbar-gutter:stable;scrollbar-width:thin}.sidebar nav button{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;padding:6px 9px;border-radius:7px;background:transparent;color:#4b5563;text-align:left;font:inherit;font-size:12.5px;line-height:1.15;cursor:pointer}.sidebar nav button::after{content:'›';color:#98a2b3}.sidebar nav button:hover{background:#f5f7fb;color:#27364a}.sidebar nav button.active{background:#e8edf5;color:#111827;font-weight:850;box-shadow:inset 3px 0 0 #111827}.sidebar nav button.active::after{color:#111827;font-weight:900}.admin-nav-service-settings{display:flex!important;align-items:center;min-height:42px;margin:2px 0 9px;padding:10px 12px!important;background:#f1f6ff;border:1px solid #d7e4fb;border-radius:9px;color:#164784!important;font-weight:850!important;word-break:keep-all}.admin-nav-service-settings.active{background:#e6efff!important;border-color:#83aceb!important;color:#0f438d!important}.admin-nav-accordion{display:grid;gap:1px}.admin-nav-accordion-toggle{font-weight:850!important;color:#1f2937!important;background:#f7f8fa!important}.admin-nav-accordion-toggle::after{content:'+'!important;font-size:12px;font-weight:900}.admin-nav-accordion-toggle[aria-expanded="true"]{background:#eceff3!important;color:#111827!important}.admin-nav-accordion-toggle[aria-expanded="true"]::after{content:'−'!important;color:#111827!important}.admin-nav-accordion-panel{display:grid;gap:1px;padding:1px 0 2px 8px}.admin-nav-accordion-panel[hidden]{display:none!important}.sidebar nav a{width:100%;display:flex;align-items:center;border:0;padding:6px 9px;border-radius:7px;background:transparent;color:#4b5563;text-align:left;font:inherit;font-size:12.5px;line-height:1.15;cursor:pointer;text-decoration:none}.sidebar nav a:hover{background:#f5f7fb;color:#27364a}.sidebar nav a.active{background:#e8edf5;color:#111827;font-weight:850;box-shadow:inset 3px 0 0 #111827}.sidebar nav a.active[aria-current="page"]{color:#000}.admin-nav-group-label{display:block;margin:5px 8px 1px;padding-top:4px;border-top:1px solid #edf0f5;color:#98a2b3;font-size:9.5px;line-height:1.1;font-weight:800;letter-spacing:.04em}.sidebar nav>.admin-nav-group-label:first-child{margin-top:0;padding-top:0;border-top:0}.admin-subnav{display:none!important}.admin-subnav a{display:inline-flex;align-items:center;min-height:34px;padding:7px 10px;border:1px solid transparent;border-radius:8px;color:#596579;text-decoration:none;font-size:12px}.admin-subnav a:hover,.admin-subnav a.active{border-color:#dce3ee;background:#fff;color:#1f3c88;font-weight:700}.admin-subnav-lock{color:#8a94a6;font-size:12px}.boundary{font-size:11px;line-height:1.5;color:#8a94a6;padding:14px 10px;margin:18px 0 0;border-top:1px solid #edf0f5}.boundary a{color:inherit}.sidebar-footer{display:grid;gap:8px;margin-top:auto;padding:12px 10px 2px;border-top:1px solid #edf0f5}.sidebar-footer .public-link{margin:0;text-align:center}.sidebar-footer button{border:1px solid #dfe5ee;background:#fff;color:#374151;border-radius:9px;padding:8px 11px;font-size:12px;cursor:pointer}main{padding:26px 30px 40px;max-width:none;width:100%;min-width:0;background:#f5f7fb;color:#172033}main>*{width:100%;max-width:1480px}.heading{display:none!important}.heading .state{display:none}.eyebrow{font-size:11px;letter-spacing:.12em;color:#7d8796;margin:0 0 5px}.heading h1{font-size:25px;margin:0 0 5px;letter-spacing:-.04em}.heading p:not(.eyebrow){margin:0;color:#6b7280;font-size:13px}.state{font-size:12px;border:1px solid #dce3ee;background:#fff;border-radius:999px;padding:7px 10px;color:#596579;white-space:nowrap}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.card,.panel{background:#fff;border:1px solid #e6eaf1;border-radius:12px}.card{padding:14px}.card span{display:block;color:#7d8796;font-size:11px}.card strong{display:block;font-size:21px;margin-top:5px;letter-spacing:-.03em}.card small{display:block;color:#99a2b1;font-size:10px;margin-top:4px}.panel{padding:14px;min-height:0}.panel h2{font-size:15px;margin:0 0 10px}.loading,.empty{font-size:13px;color:#8a94a6}.loading-shell{display:grid;gap:12px}.loading-bar{height:14px;border-radius:999px;background:linear-gradient(90deg,#eef2f6 25%,#f8fafc 50%,#eef2f6 75%);background-size:200% 100%;animation:adminLoading 1.4s linear infinite}.loading-bar.short{width:34%}.loading-bar.mid{width:62%}@keyframes adminLoading{to{background-position:-200% 0}}.table-wrap{overflow:auto;border:1px solid #edf0f5;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #edf0f5;white-space:nowrap}th{background:#fafbfc;color:#667085}td{color:#3f4858}.tag{display:inline-flex;padding:3px 7px;border-radius:999px;background:#f1f4f8;color:#657083;font-size:10px}.tag.live{background:#edf8f1;color:#287347}.tag.warn{background:#fff5e9;color:#9a5a12}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.button{display:inline-flex;text-decoration:none;border:1px solid #dce3ee;background:#fff;color:#334155;border-radius:8px;padding:8px 10px;font-size:12px}.button.primary{background:#1f3c88;color:#fff;border-color:#1f3c88}.service-list{display:grid;gap:8px}.service-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px;border:1px solid #edf0f5;border-radius:9px}.service-row strong{font-size:13px}.service-row p{margin:3px 0 0;color:#7d8796;font-size:11px}.service-row a{font-size:11px;color:#1f3c88;text-decoration:none}.trade-form{margin-top:16px;padding-top:16px;border-top:1px solid #edf0f5}.trade-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.trade-grid label{display:grid;gap:5px;font-size:11px;color:#667085}.trade-grid input,.trade-grid select{width:100%;border:1px solid #dce3ee;border-radius:8px;background:#fff;color:#172033;padding:9px 10px;font:inherit}.trade-scope-box{margin-top:12px;padding:12px;border:1px solid #e6eaf1;border-radius:10px;background:#fafbfc}.trade-scope-box>strong{display:block;font-size:12px;margin-bottom:8px}.trade-company-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.trade-company-checks label{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:7px;padding:8px;border:1px solid #e6eaf1;border-radius:8px;background:#fff;font-size:12px}.trade-company-checks small{color:#8a94a6}.trade-flash{min-height:18px;color:#9a5a12;font-size:12px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}.panel-head h2{margin:0 0 4px}.panel-head .empty{margin:0}.panel-tools{display:grid;grid-template-columns:minmax(240px,1fr) 170px 160px auto;gap:8px;margin-bottom:12px}.panel-tools input,.panel-tools select{width:100%;min-height:38px;border:1px solid #dce3ee;border-radius:8px;background:#fff;color:#172033;padding:8px 10px;font:inherit;font-size:12px}.role-guide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.role-card{padding:12px;border:1px solid #e6eaf1;border-radius:10px;background:#fafbfc}.role-card strong{font-size:12px}.role-card p{margin:6px 0 0;color:#6b7280;font-size:11px;line-height:1.55}.editor-shell{margin-top:16px;padding:14px;border:1px solid #dfe5ee;border-radius:12px;background:#fafbfc}.editor-shell .trade-form{margin-top:0;padding-top:0;border-top:0}.hidden{display:none!important}.activity-admin-view main{padding:18px 20px 28px}.activity-admin-view .heading{margin-bottom:8px}.activity-admin-view .heading h1{font-size:22px}.activity-admin-view .heading p:not(.eyebrow){font-size:12px}.activity-admin-view .cards{margin-bottom:8px}.activity-summary{display:flex;align-items:stretch;gap:8px;overflow-x:auto;margin-bottom:8px}.activity-summary .activity-metric{flex:1 1 0;min-width:116px;padding:9px 11px;border:1px solid #e6eaf1;border-radius:10px;background:#fff;display:flex;align-items:baseline;justify-content:space-between;gap:8px}.activity-metric span{font-size:11px;color:#7d8796}.activity-metric strong{font-size:18px;letter-spacing:-.03em}.activity-admin-panel{padding:10px}.activity-toolbar{display:grid;grid-template-columns:minmax(320px,1.45fr) minmax(220px,1fr) 138px 138px auto auto;gap:7px;align-items:center;margin-bottom:8px}.activity-toolbar input,.activity-toolbar select{width:100%;min-height:34px;border:1px solid #dce3ee;border-radius:8px;background:#fff;color:#172033;padding:6px 9px;font:inherit;font-size:11px}.activity-context{display:flex;align-items:center;gap:7px;min-width:0}.activity-context strong{font-size:13px;white-space:nowrap}.activity-context select{min-width:0;flex:1}.activity-context .tag{flex:0 0 auto}.activity-table-wrap th,.activity-table-wrap td{padding:7px 8px;vertical-align:top}.activity-table-wrap table{font-size:11px}.activity-seq,.activity-seq-head{width:52px;min-width:52px;text-align:center;color:#667085;font-variant-numeric:tabular-nums}.activity-seq{font-weight:700}.activity-seq-head{font-size:11px}.activity-person strong{font-size:12px}.activity-person small{display:block;color:#7d8796;margin-top:2px}.activity-table-wrap select,.activity-table-wrap input{min-height:31px;border:1px solid #dce3ee;border-radius:7px;background:#fff;color:#172033;padding:5px 7px;font:inherit;font-size:11px}.activity-table-wrap input[type="number"]{width:62px}.activity-status-note{display:block;margin-top:3px;color:#8a94a6;font-size:10px}.activity-manage details{min-width:230px}.activity-manage summary{cursor:pointer;display:inline-flex;align-items:center;min-height:31px;padding:5px 8px;border:1px solid #dce3ee;border-radius:7px;background:#fafbfc;color:#43506a;font-size:11px;font-weight:700}.activity-detail-grid{display:grid;gap:6px;margin-top:6px}.activity-detail-grid input,.activity-detail-grid select{width:100%}.activity-detail-meta{font-size:10px;color:#8a94a6;line-height:1.45}.activity-table-wrap .actions{margin-top:0;gap:5px;flex-wrap:nowrap}.activity-table-wrap .button{padding:7px 8px;font-size:11px}.activity-select-person{display:flex;align-items:flex-start;gap:7px}.activity-select-person input{margin-top:2px}.activity-select-person span{min-width:0}.activity-payment-summary{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px}.activity-payment-summary span{display:inline-flex;gap:5px;align-items:center;padding:6px 8px;border:1px solid #e6eaf1;border-radius:8px;background:#fff;color:#667085;font-size:11px}.activity-payment-summary strong{color:#172033}.activity-message-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.activity-share-field textarea{width:100%;border:1px solid #dce3ee;border-radius:8px;background:#fff;padding:8px 10px;font:inherit;resize:vertical}.activity-message-history{margin-top:12px;padding-top:10px;border-top:1px solid #edf0f5}.activity-message-history>strong{font-size:12px}.activity-message-history p{margin:5px 0;color:#667085;font-size:10px}.activity-add{margin-top:8px;border:1px solid #e6eaf1;border-radius:10px;background:#fff;overflow:hidden}.activity-add>summary{cursor:pointer;padding:10px 12px;font-size:12px;font-weight:800;color:#334155}.activity-add .editor-shell{margin:0;border:0;border-top:1px solid #edf0f5;border-radius:0;background:#fafbfc}.activity-share-dialog{width:min(560px,calc(100vw - 28px));border:0;border-radius:14px;padding:0;box-shadow:0 24px 70px rgba(15,23,42,.24)}.activity-share-dialog::backdrop{background:rgba(15,23,42,.42)}.activity-share-shell{padding:16px}.activity-share-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.activity-share-head h2{margin:0;font-size:17px}.activity-share-head p{margin:4px 0 0;color:#6b7280;font-size:11px;line-height:1.5}.activity-share-close{border:1px solid #dce3ee;background:#fff;border-radius:8px;min-width:34px;min-height:34px;cursor:pointer}.activity-share-state{margin:12px 0;padding:10px;border:1px solid #e6eaf1;border-radius:10px;background:#fafbfc;font-size:12px}.activity-share-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.activity-share-field{display:grid;gap:5px;font-size:11px;color:#667085}.activity-share-field select,.activity-share-field input[type="datetime-local"],.activity-share-link{width:100%;min-height:38px;border:1px solid #dce3ee;border-radius:8px;background:#fff;padding:8px 10px;font:inherit}.activity-share-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}.activity-share-fields label{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid #e6eaf1;border-radius:8px;background:#fff;font-size:11px}.activity-share-lock{margin:10px 0 0;padding:9px 10px;border-radius:8px;background:#f7f9fc;color:#667085;font-size:10px;line-height:1.5}.activity-share-link-row{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:10px}.activity-share-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.activity-share-status{min-height:18px;margin:8px 0 0;color:#596579;font-size:11px}.activity-share-status.error{color:#9b2c2c}@media(max-width:620px){.activity-share-grid,.activity-share-fields{grid-template-columns:1fr 1fr}.activity-share-link-row{grid-template-columns:1fr}.activity-share-actions .button{flex:1;justify-content:center}}@media(max-width:860px){.topbar{display:flex;height:auto;min-height:52px;gap:8px;padding:8px 12px}.layout{grid-template-columns:1fr;min-height:0}.sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid #e6eaf1;padding:8px 12px}.scope,.boundary{display:none}.sidebar nav{display:flex;overflow-x:auto;overflow-y:hidden;gap:3px}.sidebar nav button{flex:0 0 auto;width:auto;white-space:nowrap;padding:8px 10px}.sidebar nav button::after{display:none}.sidebar nav a{flex:0 0 auto;width:auto;white-space:nowrap;padding:8px 10px}.activity-admin-view main{padding:10px 10px 20px}.activity-toolbar{grid-template-columns:1fr 1fr}.activity-context{grid-column:1/-1}.activity-public-link{justify-content:center}.activity-table-wrap{border:0;overflow:visible}.activity-table-wrap table,.activity-table-wrap tbody{display:block}.activity-table-wrap thead{display:none}.activity-table-wrap tr{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:8px;padding:10px;border:1px solid #edf0f5;border-radius:10px;margin-bottom:8px;background:#fff}.activity-table-wrap td{display:block;border:0;padding:0;white-space:normal}.activity-table-wrap td:nth-child(1){grid-column:1}.activity-table-wrap .activity-seq{width:auto;min-width:0}.activity-table-wrap td:nth-child(2){grid-column:2}.activity-table-wrap td:nth-child(3){grid-column:3}.activity-table-wrap td:nth-child(4),.activity-table-wrap td:nth-child(5),.activity-table-wrap td:nth-child(6){grid-column:1/-1}.activity-manage details{min-width:0}.activity-table-wrap .actions{justify-content:flex-start}.admin-subnav{min-height:0;justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;margin-bottom:10px;padding:6px 0}.admin-subnav a{flex:0 0 auto;min-height:32px;white-space:nowrap}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.trade-grid,.trade-company-checks,.panel-tools,.role-guide{grid-template-columns:1fr}.panel-head{align-items:stretch}main{padding:14px 12px 24px}.topbar .context span{display:none}.topbar .public-link{padding:7px 9px;font-size:12px}.heading{gap:10px;margin-bottom:10px}.panel{min-height:0;padding:12px}.loading,.empty{min-height:0;margin:0;line-height:1.5}}@media(max-width:620px){.heading{display:grid}.heading .state{justify-self:start}.cards{grid-template-columns:1fr 1fr}.mall-decision{min-height:0}.mall-quick-actions{display:grid;grid-template-columns:1fr 1fr}.mall-quick-actions .button{justify-content:center}.context strong{font-size:13px}}`;

const MALL_DASH_CSS=`.mall-command{display:grid;gap:12px}.mall-command-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px}.mall-command-box{border:1px solid #e6eaf1;border-radius:12px;padding:14px;background:#fafbfc}.mall-command-box h3{margin:0 0 8px;font-size:13px}.mall-command-kicker{font-size:10px;letter-spacing:.08em;color:#718096;text-transform:uppercase}.mall-money{font-size:28px;font-weight:800;letter-spacing:-.04em;margin:5px 0}.mall-proof{font-size:10px;color:#7d8796;line-height:1.5}.mall-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:10px}.mall-flow div{padding:9px;border:1px solid #e6eaf1;border-radius:9px;background:#fff}.mall-flow span{display:block;font-size:9px;color:#8a94a6}.mall-flow strong{display:block;font-size:14px;margin-top:3px}.mall-decisions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mall-decision{padding:11px;border:1px solid #e6eaf1;border-radius:10px;background:#fff;min-height:128px}.mall-decision h4{font-size:12px;margin:6px 0}.mall-decision p{font-size:10px;line-height:1.55;color:#6b7280;margin:4px 0}.mall-decision strong{font-size:12px}.mall-action-scale{border-top:3px solid #2d7a50}.mall-action-test{border-top:3px solid #315d9a}.mall-action-observe{border-top:3px solid #9a7112}.mall-action-hold{border-top:3px solid #8c5660}.mall-activity{display:grid;gap:6px}.mall-activity-row{display:grid;grid-template-columns:80px 1fr auto;gap:9px;align-items:center;padding:8px 0;border-bottom:1px solid #edf0f5;font-size:11px}.mall-activity-row:last-child{border-bottom:0}.mall-activity-row small{color:#8a94a6}.mall-next{padding:12px;border-radius:10px;background:#172033;color:#fff}.mall-next small{display:block;color:#aeb9cb;margin-bottom:5px}.mall-next strong{font-size:15px}.mall-next p{font-size:11px;line-height:1.5;color:#cbd5e1;margin:6px 0 0}.mall-login-guide{display:grid;gap:12px}.mall-login-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mall-login-item{padding:12px;border:1px solid #e6eaf1;border-radius:10px;background:#fafbfc}.mall-login-item strong{display:block;font-size:12px;margin-bottom:5px}.mall-login-item p{margin:0;color:#6b7280;font-size:10px;line-height:1.55}.mall-login-step{padding:12px;border-radius:10px;background:#f7f9fc;border:1px solid #e4e9f1}.mall-login-step strong{display:block;font-size:12px;margin-bottom:4px}.mall-login-step p{margin:0;color:#697386;font-size:11px;line-height:1.55}.mall-quick-actions{display:flex;gap:7px;flex-wrap:wrap}.mall-quick-actions .button{background:#fff}@media(max-width:900px){.mall-command-grid,.mall-decisions,.mall-login-grid{grid-template-columns:1fr 1fr}.mall-flow{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.mall-command-grid,.mall-decisions,.mall-login-grid{grid-template-columns:1fr}.mall-flow{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

function clientMain(POLICY,ADMIN_HUB,CHANNEL_CATALOG){
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const GROWTH_API='/marketing-connect-api';
  const MAIL_CONTROL='/api/mail/control';
  const DESIGN_API='/workspace-api/v1/design-profiles';
  const SITE_CHROME_API='/workspace-api/v1/site-chrome';
  const LANGUAGE_API='/api/i18n/v1/admin';
  const AFFILIATE_API='/api/affiliate';
  const EXTERNAL_ACCOUNT_CONTROL='/api/control/external-accounts';
  let platformAdminSessionToken='';
const CHANNEL_AUTOMATION='/marketing-publish-api';

  const SESSION_KEY='ekodi-workspace-admin-session';
  const ADMIN_SSO_RECOVERY_KEY='ekodi-workspace-admin-sso-recovery-v1';
  const ADMIN_SSO_SUPPRESS_KEY='ekodi-workspace-admin-sso-suppress-v1';
  const ADMIN_SSO_RECOVERY_MAX_AGE_MS=2*60*1000;
  const PLATFORM_ADMIN_INTENT_KEY='ekodi-platform-admin-intent';
  const PLATFORM_ADMIN_INTENT_MAX_AGE_MS=10*60*1000;
      const AUTH_URL='https://ekodi.kr/auth/';
  const clean=location.pathname.replace(/\/+$/,'');
  const tradeAdminMatch=clean.match(/^\/[^/]+\/trade\/admin(?:\/([^/]+)(?:\/[^/]+)*)?$/i);
  const tradeAdminRoute=Boolean(tradeAdminMatch);
  if(tradeAdminRoute&&!['publishing','marketing','channels'].includes(String(tradeAdminMatch?.[1]||'').toLowerCase()))return;
  const standaloneMall=clean.match(/^\/ekodimall\/admin(?:\/([^/]+)(?:\/[^/]+)*)?$/i);
  const genericService=clean.match(/^\/([^/]+)\/([^/]+)\/admin(?:\/([^/]+)(?:\/[^/]+)*)?$/i);
  const root=clean.match(/^\/([^/]+)\/admin(?:\/([^/]+)(?:\/[^/]+)*)?$/i);
  const mall=Boolean(standaloneMall);
  const workspace=(standaloneMall?'ekodibiz':genericService?.[1]||root?.[1]||'ekodibiz').toLowerCase();
  const service=mall?'mall':(genericService?.[2]?.toLowerCase()||null);
  const MISSION_DEFAULT_ACTIVITY='260926-chuseok-open-table';
  const MISSION_ACTIVITY_PUBLIC_PATHS=Object.freeze({
    '260926-chuseok-open-table':'/ekodimission/apply/260926-open-table',
    '261003-autumn-community-trip':'/ekodimission/apply/261003-autumn-trip'
  });
  function missionActivityPublicUrl(activity,activityKey){
    const candidate=[activity?.public_url,activity?.application_url,activity?.public_path].find(value=>typeof value==='string'&&value.trim());
    if(candidate){
      try{
        const url=new URL(candidate,location.origin);
        if(url.origin===location.origin&&url.pathname.startsWith('/ekodimission/'))return url.pathname+url.search+url.hash;
      }catch{}
    }
    return MISSION_ACTIVITY_PUBLIC_PATHS[activityKey]||'/ekodimission/activities';
  }
  const defaultSection='overview';
  const rawSection=standaloneMall?.[1]||(genericService?.[3]||root?.[2]||((workspace==='ekodibiz'||workspace==='ekodi-biz')&&!service?'business-center':defaultSection));
  const section=(rawSection==='channel-settings'?'channels':rawSection).toLowerCase();
  const CHANNEL_TARGETS=new Map((CHANNEL_CATALOG||[]).map(target=>[target.id,target]));
  const CHANNEL_PROVIDERS=Object.freeze(Object.fromEntries((CHANNEL_CATALOG||[]).map(target=>[target.id,target])));
  const CHANNEL_AUTH_PATHS=Object.freeze({youtube:'/v1/connect/youtube/start',meta:'/v1/connect/meta/start',threads:'/v1/connect/threads/start'});
  const base=`/${workspace}`;
  const adminBase=standaloneMall?'/ekodimall/admin':service==='mall'?'/ekodimall/admin':service?`${base}/${service}/admin`:`${base}/admin`;
  const sectionHref=key=>key==='overview'?`${adminBase}/overview`:`${adminBase}/${key==='channels'?'channel-settings':key}`;
  const $=id=>document.getElementById(id);
  const CHANNEL_OAUTH_RESULT_KEY='ekodi-channel-oauth-result-v1';
  const CHANNEL_OAUTH_POPUP_NAME='ekodi_channel_oauth_popup';
  // sessionStorage survives the round-trip through Google's site in the same popup.
  // Some browsers clear window.name during cross-site navigation.
  const CHANNEL_OAUTH_POPUP_MARKER='ekodi-channel-oauth-popup-pending-v1';
  let channelOAuthNotice=null;
  // An OAuth redirect can only confirm that the callback ran. A completed
  // channel connection must also exist in the current tenant's live vault.
  const channelOAuthConfirmed=(result,connections)=>result?.status==='success'&&
    (connections||[]).some(x=>x.status==='active'&&
      (result.provider==='meta'?['facebook','instagram'].includes(x.provider):x.provider===result.provider));
  const channelOAuthCopy=(result,verified,label)=>verified
    ?label+' 계정 연결이 서버에서 확인됐습니다. 다시 인증할 필요가 없습니다.'
    :result.status==='success'
      ?label+' 인증 화면에서 돌아왔지만 서버의 활성 연결을 확인하지 못했습니다. 인증 결과 확인 버튼으로 상태를 조회하세요. 연결이 확인되기 전에는 재인증을 반복하지 마세요.'
      :label+' 인증을 완료하지 못했습니다.'+(result.reason?' '+result.reason:'');
  const channelOAuthResultFromLocation=()=>{
    const params=new URLSearchParams(location.search),status=params.get('ekodi_connect');
    if(!['success','error'].includes(String(status||'')))return null;
    return {type:'ekodi-channel-oauth-result',status,provider:params.get('provider')||'',connections:Number(params.get('connections')||0),reason:params.get('reason')||'',at:Date.now()};
  };
  const clearChannelOAuthResultUrl=()=>{
    const url=new URL(location.href);
    for(const key of ['ekodi_connect','provider','connections','reason'])url.searchParams.delete(key);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  };
  const publishChannelOAuthResult=result=>{
    if(!result)return;
    try{localStorage.setItem(CHANNEL_OAUTH_RESULT_KEY,JSON.stringify(result))}catch{}
    try{const bus=new BroadcastChannel(CHANNEL_OAUTH_RESULT_KEY);bus.postMessage(result);bus.close()}catch{}
  };
  const initialChannelOAuthResult=channelOAuthResultFromLocation();
  if(initialChannelOAuthResult){
    publishChannelOAuthResult(initialChannelOAuthResult);
    clearChannelOAuthResultUrl();
    let returnedInPopup=window.name===CHANNEL_OAUTH_POPUP_NAME;
    try{
      if(sessionStorage.getItem(CHANNEL_OAUTH_POPUP_MARKER)==='pending')returnedInPopup=true;
      sessionStorage.removeItem(CHANNEL_OAUTH_POPUP_MARKER);
    }catch{}
    if(returnedInPopup){
      // A callback is not proof of an active tenant-scoped OAuth connection.
      // An error callback must never be shown as a completed authorization.
      const callbackOk=initialChannelOAuthResult.status==='success';
      const callbackTitle=callbackOk?'Google 인증 응답 접수 · 연결 확인 중':'채널 인증 실패 · 연결되지 않음';
      const callbackMessage=callbackOk?'Google 응답이 접수됐습니다. 실제 채널 연결은 관리자 화면의 활성 OAuth 원장으로 확인하세요.':'Google 계정 또는 YouTube 채널 인증이 완료되지 않았습니다. 관리자 화면의 최근 연결 실패와 연결 상태를 확인하세요.';
      document.body.innerHTML='<main style="font-family:system-ui,sans-serif;max-width:440px;margin:48px auto;padding:24px;text-align:center"><h1 style="font-size:20px">'+callbackTitle+'</h1><p style="color:#667085">'+callbackMessage+'</p><button type="button" onclick="window.close()" style="padding:10px 16px">창 닫기</button></main>';
      setTimeout(()=>window.close(),120);
      return;
    }
    channelOAuthNotice=initialChannelOAuthResult;
  }
  async function applyChannelOAuthResult(result){
    if(!result||result.type!=='ekodi-channel-oauth-result'||!['success','error'].includes(String(result.status||'')))return;
    if(!['channels','publishing','marketing'].includes(section))return;
    channelOAuthNotice=result;
    try{await channel()}catch{}
    // The redirect may arrive before local UI state refresh. Read the
    // authenticated tenant-scoped connection ledger, not the URL alone.
    let liveConnections=[];
    try{const ledger=await growth('/v1/connections');liveConnections=ledger.connections||[]}catch{}
    const ok=channelOAuthConfirmed(result,liveConnections);
    const label=CHANNEL_PROVIDERS[result.provider]?.label||result.provider||'채널';
    if($('pageCopy'))$('pageCopy').textContent=channelOAuthCopy(result,ok,label);
    state(ok?'채널 연결 완료':'채널 연결 확인 필요');
  }
  try{
    const channelOAuthBus=new BroadcastChannel(CHANNEL_OAUTH_RESULT_KEY);
    channelOAuthBus.onmessage=event=>applyChannelOAuthResult(event.data);
    window.addEventListener('pagehide',()=>channelOAuthBus.close(),{once:true});
  }catch{}
  window.addEventListener('storage',event=>{
    if(event.key!==CHANNEL_OAUTH_RESULT_KEY||!event.newValue)return;
    try{applyChannelOAuthResult(JSON.parse(event.newValue))}catch{}
  });
  const fmt=n=>new Intl.NumberFormat('ko-KR').format(Number(n||0));
  const meta={services:['서비스설정','이 사이트의 공통 서비스 메뉴 표시 여부를 설정합니다. 실제 기능 사용 권한은 별도입니다.'],chrome:['헤더 · 푸터','이 사이트의 헤더와 푸터 기본정보를 관리합니다. 저장하면 이 사이트에만 반영됩니다.'],overview:['운영 홈','지금 확인할 상태와 다음 행동을 한눈에 봅니다.'],'business-center':['에코디비즈 통합업무센터','사업 · 교육 · 행정 · 문서 · 보고를 한곳에서 관리합니다.'],sales:['영업장부','게시 → 유입 → 상품조회 → 제휴클릭 → 전환을 실제 이벤트로 확인합니다.'],products:['상품관리','공개 쇼핑몰 상품과 판매처 연결을 관리합니다.'],sourcing:['판매채널 · 공급망','공통 판매·공급망 엔진에 등록된 제휴처 가운데 에코디몰에서 실제 사용할 판매채널과 적용 여부를 관리합니다.'],amazon:['Amazon 연결','Seller Central, 상품·가격·재고·주문·FBA 및 선택형 AWS 연결 상태를 관리합니다.'],marketing:['마케팅 AI','콘텐츠 생성, UTM, 캠페인과 게시 준비를 관리합니다.'],channels:['채널설정','게시 채널 연결, 운영설정과 자동게시 상태를 한곳에서 관리합니다.'],automation:['자동화','콘텐츠 생성과 예약게시 자동화 준비 상태를 확인합니다.'],growth:['AI 자동영업','아고다·쿠팡 상품의 추천·게시·유입·전환 현황과 자동 배분 설정을 관리합니다.'],analytics:['성과·학습','판매·채널·캠페인 성과와 AI 학습 결과를 확인합니다.'],mall:['에코디몰','에코디비즈가 운영하는 쇼핑몰 서비스입니다.'],work:['업무','업무 서비스 상태를 확인합니다.'],finance:['통장 · 재무','연결계좌, 거래내역, 이체요청·승인과 재무 상태를 기관 범위에서 관리합니다.'],tax:['세금 · 증빙','에코디비즈 전자세금계산서·공급자·거래처·발행대장을 관리합니다.'],confirmations:['지급·수령 확인','지급과 수령을 분리 관리하고 필요할 때 같은 거래번호로 연결합니다.'],languages:['다국어 번역·게시','이 사이트의 번역 진행 상태와 실제 게시 여부를 관리합니다.'],members:['사용자 · 권한','운영공간 로컬 역할과 권한을 관리합니다.'],design:['사이트 설정','디자인과 다국어 등 고객 화면의 표시 설정을 관리합니다.'],publishing:['채널·자동게시','이 운영공간의 SNS 계정 연결, OAuth 인증, 예약·반복 게시와 자동게시 상태를 관리합니다.'],mail:['메일','도메인 메일 주소, Gmail 전달, DNS 인증 상태를 관리합니다.'],saturday:['선교회 토요모임','토요일 공통본문과 말씀나눔·찬양·기도·모임 이후 일정을 선교회 소속으로 관리합니다.'],activities:['활동 · 참가자','활동별 신청·대기·확정·참석·불참·취소와 체크인, 역할, 동반자, 후속관리를 한 화면에서 관리합니다.'],status:['상태 · 배포','이 운영공간의 현재 접근·공개·권한 상태와 플랫폼 배포 확인 경로를 한눈에 봅니다.'],records:['설정 · 기록','운영공간 권한 경계, 변경·감사 기록과 관련 관리 화면을 확인합니다.'],member:['정회원','청계면상인회 소속 정회원 명단을 이 운영공간에서 관리합니다.'],edocs:['전자문서 · 서명','회의록·제안서 등 주요 문서를 링크로 순서대로(왼쪽부터) 서명받고 기록을 보관합니다.']};
  // These existing CGMA operations remain owned by their Supabase/D1 APIs.
  // Same-origin embedded panels reuse the original server permission gate.
  const CGMA_EMBEDDED_PANELS=Object.freeze({applications:'memberReview',booths:'festivalManager','market-oversight':'controlTower',petitions:'petitionManager','ip-archive':'ipArchive','education-survey':'educationSurveyManager'});
  const CGMA_ONLY_SECTIONS=new Set(Object.keys(CGMA_EMBEDDED_PANELS));
  Object.assign(meta,{applications:['정회원 신청 승인','신규·기존 점포의 정회원 자격 신청을 심사합니다.'],booths:['축제 부스 선정','축제 참여부스 신청을 검토하고 선정합니다.'],'market-oversight':['상권 운영 현황','상권 참여와 운영카드를 확인합니다.'],petitions:['민원·동의 접수','운영상 필요한 비공개 접수만 확인합니다.'],'ip-archive':['지식재산권 자료실','상인회 자료 원본 권한과 공유내역을 확인합니다.'],'education-survey':['AI 교육 신청현황','교육 수요조사 집계와 동의된 신청 연락처를 확인합니다.']});
  const isBizWorkspace=service==='mall'||workspace==='ekodi-biz'||workspace==='ekodibiz';
  const serviceSections=workspace==='cgma'?[['edocs','전자문서 · 서명'],['confirmations','지급·수령 확인']]:[['mail','메일'],['confirmations','지급·수령 확인'],['work','업무'],['finance','재무']];
  if(isBizWorkspace)serviceSections.push(['mall','에코디몰']);
  const peopleSections=workspace==='cgma'?[['member','정회원'],['festival','모터페스티벌 신청'],['members','관리자 · 권한']]:[['members','사용자 · 권한']];
  const contentSections=[...(workspace==='ekodimission'?[['saturday','토요모임'],['activities','행사 · 신청자']]:[]),['publishing','채널·자동게시'],['marketing','마케팅 AI']];
  // 청계면상인회 전용 업무(전자문서·정회원·모터페스티벌)는 모든 관리자 역할의 메뉴에 같은 순서로 나타납니다.
  const cgmaSiteGroups=workspace==='cgma'?[{id:'cgma-review',label:'상인회 · 심사',sections:[['edocs','전자문서 · 서명'],['member','정회원 명단'],['applications','정회원 신청 승인'],['booths','축제 참여부스 선정'],['festival','모터페스티벌 신청']]},{id:'cgma-operations',label:'상인회 · 운영',sections:[['market-oversight','상권 운영 현황'],['petitions','민원·동의 접수'],['ip-archive','지식재산권 자료실'],['education-survey','AI 교육 신청현황']]}]:[];
  const standardRootGroups=[
    ...cgmaSiteGroups,
    {id:'home',label:'운영',sections:[['overview','운영 홈'],...(isBizWorkspace&&!service?[['business-center','비즈 통합업무센터']]:[])]},
    {id:'work',label:'고객 · 업무',sections:[['work','업무'],['confirmations','지급 · 수령 확인']]},
    {id:'marketing',label:'마케팅',sections:[...(workspace==='ekodimission'?[['saturday','토요모임'],['activities','행사 · 신청자']]:[]),['marketing','마케팅 AI'],['publishing','채널 · 자동게시']]},
    {id:'management',label:'경영',sections:[['finance','재무']]},
    {id:'tools',label:'운영도구',sections:[['mail','메일'],['languages','다국어 번역 · 게시']]},
    {id:'site-access',label:'사이트 관리',sections:[['chrome','헤더 · 푸터'],['design','사이트 디자인'],...(workspace==='cgma'?peopleSections.filter(([key])=>key==='members'):peopleSections),['status','운영 상태'],['records','변경 · 감사 기록']]}
  ];
  const localRootGroups=[
    ...cgmaSiteGroups,
    {id:'today',label:'오늘 할 일',sections:[['overview','운영 홈'],...(workspace==='ekodimission'?[['saturday','토요모임'],['activities','행사 · 신청자']]:[])]},
    {id:'communication',label:'소통 · 콘텐츠',sections:[['publishing','채널 · 자동게시'],['marketing','마케팅 AI'],['mail','메일']]},
    {id:'work',label:'업무 처리',sections:[['work','업무'],['confirmations','지급 · 수령 확인'],['finance','재무']]}
  ];
  const viewerRootGroups=[{id:'view',label:'조회',sections:[['overview','운영 홈'],['finance','재무'],['status','운영 상태']]}];
  const specialistRootGroups=[{id:'specialist',label:'외부 전문작업',sections:[['overview','운영 홈'],['status','운영 상태']]}];
  const adminHubScopes=Array.isArray(ADMIN_HUB?.scopes)?ADMIN_HUB.scopes:[];
  const taxMenu=Array.isArray(ADMIN_HUB?.taxMenu)?ADMIN_HUB.taxMenu:[];
  const adminHubSource=new URLSearchParams(location.search).get('source')||'';
  const mallDirectSections=[['overview','홈'],['products','상품'],['sourcing','판매채널 · 공급망'],['analytics','주문 · 성과'],['channels','게시채널'],['growth','자동운영'],['confirmations','지급 · 수령'],['design','몰 설정']];
  const mallDelegatedGroups=[
    {id:'home',label:'홈',sections:[['overview','운영 홈']]},
    {id:'catalog',label:'상품 · 공급',sections:[['products','상품'],['sourcing','판매채널 · 공급망']]},
    {id:'sales',label:'판매 · 채널',sections:[['analytics','주문 · 성과'],['channels','게시채널']]},
    {id:'automation',label:'자동운영',sections:[['growth','AI 자동영업']]},
    {id:'settlement',label:'지급 · 수령',sections:[['confirmations','지급 · 수령']]},
    {id:'settings',label:'설정',sections:[['design','몰 설정']]}
  ];
  const mallLocalGroups=[
    {id:'today',label:'오늘 판매',sections:[['overview','운영 홈'],['analytics','주문 · 성과']]},
    {id:'catalog',label:'상품 · 공급',sections:[['products','상품'],['sourcing','판매채널 · 공급망']]},
    {id:'growth',label:'홍보 · 자동운영',sections:[['channels','게시채널'],['growth','AI 자동영업']]},
    {id:'settlement',label:'지급 · 수령',sections:[['confirmations','지급 · 수령']]},
    {id:'settings',label:'설정',sections:[['design','몰 설정']]}
  ];

  let workspaceContext=null;
  let workspaceRole='';
  let siteServiceSnapshot=null,siteServiceError='';
  let aiToolSnapshot=null,aiToolError='';
  let sitePreferenceWritePending=false;
  function serviceMenuVisible(key){
    if(!Array.isArray(siteServiceSnapshot?.items))return true;
    // The Mall owns a local "channels" route while the shared catalog stores
    // social publishing visibility under "publishing". Translate only this
    // established route; do not give the menu extra privileges.
    const catalogSection=service==='mall'&&key==='channels'?'publishing':key;
    const related=siteServiceSnapshot.items.filter(x=>x.readiness==='ready'&&x.navSection===catalogSection);
    return !related.length||related.some(x=>x.menuVisible===true);
  }
  async function siteServiceApi(name,body,resultKey='items'){
    const token=await accessToken();if(!token||!workspaceContext?.tenantId)throw new Error('사이트 관리자 로그인 필요');
    const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',
      headers:{apikey:SUPABASE_KEY,authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    const data=await r.json().catch(()=>null);
    if(!r.ok)throw new Error(data?.message||data?.error||'서비스 설정 연결 오류 ('+r.status+')');
    if(!Array.isArray(data?.[resultKey]))throw new Error('서비스 원장 응답 형식 오류');
    return data;
  }
  async function loadSiteServices(){
    const tenant=workspaceContext?.tenantId;
    if(!tenant){siteServiceSnapshot=null;aiToolSnapshot=null;siteServiceError='사이트 문맥 확인 필요';return;}
    const results=await Promise.allSettled([
      siteServiceApi('tenant_site_service_catalog_snapshot',{p_tenant_id:tenant}),
      siteServiceApi('tenant_ai_tool_catalog_snapshot',{p_tenant_id:tenant},'tools')
    ]);
    if(results[0].status==='fulfilled'){siteServiceSnapshot=results[0].value;siteServiceError='';}
    else{siteServiceSnapshot=null;siteServiceError=results[0].reason?.message||'서비스 설정 연결 실패';}
    if(results[1].status==='fulfilled'){aiToolSnapshot=results[1].value;aiToolError='';}
    else{aiToolSnapshot=null;aiToolError=results[1].reason?.message||'AI 도구 원장 연결 실패';}
  }
  async function siteServiceSettings(){
    $('summaryCards').replaceChildren();
    renderTenantServiceAdmin($('mainPanel'),{items:siteServiceSnapshot?.items||[],error:siteServiceError,
      aiTools:aiToolSnapshot?.tools||[],aiError:aiToolError,
      onToggle:async(item,next)=>{
        if(sitePreferenceWritePending)return;
        sitePreferenceWritePending=true;
        try{
          // The write RPC alone is not a save receipt: fetch an independent
          // server snapshot before updating the visible menu or showing success.
          siteServiceSnapshot=await confirmTenantServicePreference({
            call:siteServiceApi,tenantId:workspaceContext.tenantId,
            kind:'service',id:item.key,selected:next
          });
          siteServiceError='';renderNav(workspaceRole);
        }catch(e){
          siteServiceError=e.message||'서비스 설정 저장 확인 실패';
        }finally{
          sitePreferenceWritePending=false;
          await siteServiceSettings();
        }
      },
      onAiToggle:async(item,next)=>{
        if(sitePreferenceWritePending)return;
        sitePreferenceWritePending=true;
        try{
          aiToolSnapshot=await confirmTenantServicePreference({
            call:siteServiceApi,tenantId:workspaceContext.tenantId,
            kind:'ai',id:item.id,selected:next
          });
          aiToolError='';
        }catch(e){
          aiToolError=e.message||'AI 도구 설정 저장 확인 실패';
        }finally{
          sitePreferenceWritePending=false;
          await siteServiceSettings();
        }
      },
    });
    // Service settings is the existing site-admin surface; do not invent a
    // second notification administrator menu or trust its client-side site.
    // A verified member token is independently scoped by the central API.
    const notificationTopic=mall?'mall'
      :workspace==='ekodimission'?'mission'
      :['ekodichurch','ekodi-church'].includes(workspace)?'church'
      :['cgma','cheonggye'].includes(workspace)?'community':null;
    if(notificationTopic){
      mountTenantNotificationMetrics($('mainPanel'),{
        topic:notificationTopic,
        load:async (key,window='7d')=>{
          const token=await accessToken();
          if(!token)throw new Error('AUTH_REQUIRED');
          const response=await fetch('/api/notifications/admin/summary?topic='+encodeURIComponent(key)+'&window='+encodeURIComponent(window),{
            headers:{authorization:'Bearer '+token,accept:'application/json'},
            cache:'no-store',credentials:'omit'
          });
          if(!response.ok)throw new Error('TOPIC_NOT_AUTHORIZED');
          return response.json();
        }
      });
    }
    state(siteServiceError||aiToolError?'저장 검증 확인 필요':'사이트 메뉴 설정');
  }
  const SECTION_CAPABILITY=service==='mall'?{services:POLICY.capabilities.site,design:POLICY.capabilities.site,languages:POLICY.capabilities.language,overview:POLICY.capabilities.dashboard,sales:POLICY.capabilities.sales,products:POLICY.capabilities.catalog,sourcing:POLICY.capabilities.supplyNetwork,amazon:POLICY.capabilities.supplyNetwork,marketing:POLICY.capabilities.marketing,channels:POLICY.capabilities.marketing,automation:POLICY.capabilities.marketing,growth:POLICY.capabilities.marketing,analytics:POLICY.capabilities.sales,confirmations:POLICY.capabilities.confirmations}:{services:POLICY.capabilities.site,chrome:POLICY.capabilities.site,design:POLICY.capabilities.site,languages:POLICY.capabilities.language,overview:POLICY.capabilities.dashboard,'business-center':POLICY.capabilities.operations,activities:POLICY.capabilities.activities,saturday:POLICY.capabilities.activities,mall:POLICY.capabilities.dashboard,mail:POLICY.capabilities.connections,publishing:POLICY.capabilities.marketing,marketing:POLICY.capabilities.marketing,work:POLICY.capabilities.operations,finance:POLICY.capabilities.finance,tax:POLICY.capabilities.finance,confirmations:POLICY.capabilities.confirmations,members:POLICY.capabilities.access,member:POLICY.capabilities.memberRoster,festival:POLICY.capabilities.access,edocs:POLICY.capabilities.access,applications:POLICY.capabilities.access,booths:POLICY.capabilities.access,'market-oversight':POLICY.capabilities.operations,petitions:POLICY.capabilities.access,'ip-archive':POLICY.capabilities.access,'education-survey':POLICY.capabilities.operations,status:POLICY.capabilities.logs,records:POLICY.capabilities.reports};
  const roleCapabilities=role=>POLICY.roleCapabilities[String(role||'').trim().toLowerCase()]||[];
  const navigationProfile=role=>POLICY.roleNavigationProfiles?.[String(role||'').trim().toLowerCase()]||'local-operator';
  const hasFullWorkspaceAdminScope=role=>roleCapabilities(role).includes('*');
  function renderAdminScopeSwitcher(role=workspaceRole){
    const host=$('adminScopeSwitcher');if(!host)return;host.replaceChildren();
    const permitted=new Set(workspaceContext?.authorizedAdminScopeIds||[]);
    const visible=adminHubScopes.filter(scope=>permitted.has(scope.id));
    if(!(isBizWorkspace||adminHubSource==='ekodibiz')||!hasFullWorkspaceAdminScope(role)||!visible.length){host.hidden=true;return}
    const current=service==='mall'?'mall':workspace==='ekodi-lab'?'lab':'common';
    if(!permitted.has(current)){host.hidden=true;return}
    host.hidden=false;host.dataset.adminScopeCurrent=current;
    const label=document.createElement('span');label.className='admin-scope-label';label.textContent='관리 사이트';host.append(label);
    const select=document.createElement('select');select.className='admin-scope-select';select.setAttribute('aria-label','관리 사이트 전환');
    for(const scope of visible){const option=document.createElement('option');option.value=scope.adminHref;option.textContent=scope.label;option.dataset.adminScope=scope.id;option.title=scope.description||scope.label;option.selected=scope.id===current;select.append(option)}
    select.onchange=()=>{if(select.value){const target=select.value.replace(/\/$/,'')+'/services';if(target!==location.pathname)location.assign(target)}};
    host.append(select);
  }
  const canSection=(key,role=workspaceRole)=>{if(CGMA_ONLY_SECTIONS.has(key)&&workspace!=='cgma')return false;if(key==='tax'&&!isBizWorkspace)return false;if(key==='business-center'&&!(isBizWorkspace&&!service&&hasFullWorkspaceAdminScope(role)))return false;const capability=SECTION_CAPABILITY[key];const allowed=roleCapabilities(role);return Boolean(capability&&(allowed.includes('*')||allowed.includes(capability)));};
  function groupsForRole(role=workspaceRole){
    const profile=navigationProfile(role);
    if(service==='mall'){
      if(profile==='delegated-manager')return mallDelegatedGroups;
      if(profile==='viewer'||profile==='external-specialist')return [{id:'view',label:'조회',sections:[['overview','운영 홈'],['analytics','주문 · 매출']]}];
      return mallLocalGroups;
    }
    if(profile==='delegated-manager')return standardRootGroups;
    if(profile==='viewer')return viewerRootGroups;
    if(profile==='external-specialist')return specialistRootGroups;
    return localRootGroups;
  }
  function renderSecondaryNav(){const h=$('sectionNav');if(!h)return;h.replaceChildren();h.hidden=true}
  function dedicatedSections(){
    const dedicated=new Set();
    if(service==='mall')for(const key of ['products','sourcing','amazon','analytics','channels','growth'])dedicated.add(key);
    if(workspace==='ekodimission'){dedicated.add('saturday');dedicated.add('activities');}
    if(workspace==='cgma'){dedicated.add('member');dedicated.add('festival');dedicated.add('edocs');for(const key of ['applications','booths','market-oversight','petitions','ip-archive','education-survey'])dedicated.add(key);}
    if(isBizWorkspace&&!service)for(const key of ['business-center','finance','mall'])dedicated.add(key);
    if(service&&service!=='mall')for(const key of ['publishing','marketing','channels'])dedicated.add(key);
    return dedicated;
  }
  function navBucketsForRole(role=workspaceRole){
    const groups=groupsForRole(role),dedicated=dedicatedSections(),seen=new Set(),common=[],site=[];
    for(const group of groups){for(const item of group.sections){const [key,label]=item;if(seen.has(key))continue;if(role?!canSection(key,role):!(workspace==='ekodimission'||key==='overview'))continue;if(typeof serviceMenuVisible==='function'&&!serviceMenuVisible(key))continue;seen.add(key);(dedicated.has(key)?site:common).push([key,label]);}}
    // Service configuration is a common site-local operation, never a third sidebar bucket.
    // Site service settings is a standalone navigation entry, never duplicated in work menus.
    const items=[...common,...site].filter(([key])=>key!=='services');
    // Site-local managers see one task-oriented menu; internal service ownership remains metadata.
    const buckets=[{id:'work',label:'업무메뉴',items}].filter(bucket=>bucket.items.length);
    // Every tenant presents common operations first, then site-dedicated operations.
    return buckets;
  }
  function renderNav(role=workspaceRole){
    const h=$('adminNav');h.replaceChildren();document.documentElement.dataset.ekodiAdminNavigationProfile=navigationProfile(role);
    if(role&&canSection('services',role)){
      const settings=document.createElement('a');settings.href=sectionHref('services');
      settings.textContent='서비스설정';settings.dataset.adminSection='services';
      settings.className='admin-nav-service-settings'+(section==='services'?' active':'');
      if(section==='services')settings.setAttribute('aria-current','page');
      h.append(settings);
    }
    if(workspace==='ekodichurch'&&!service){
      document.documentElement.dataset.ekodiChurchUnifiedAdmin='true';
      const tabs=$('sectionNav');
      tabs.className='church-admin-detail-tabs';
      const heading=document.querySelector('main .heading');
      if(heading&&tabs.previousElementSibling!==heading)heading.after(tabs);
      const permitted=roleCapabilities(role);
      mountChurchAdminNavigation({
        root:h,tabsRoot:tabs,groups:CHURCH_ADMIN_MENU,
        activeKey:section,activeOwner:'workspace',base:'/ekodichurch/admin',
        canView:tab=>{
          if(!role)return tab.owner==='church'&&tab.key==='overview';
          if(role==='worship_admin')return tab.owner==='church'&&tab.key==='worship';
          // A site setting controls menu visibility only; it never changes server permissions.
          if(tab.owner==='workspace'&&tab.key!=='services'&&!serviceMenuVisible(tab.key))return false;
          const capability=POLICY.capabilities[tab.capability];
          return Boolean(capability&&(permitted.includes('*')||permitted.includes(capability)));
        }
      });
      return;
    }
    const buckets=navBucketsForRole(role),activeKey=service==='mall'&&section==='languages'?'design':service==='mall'&&section==='amazon'?'sourcing':section;
    for(const bucket of buckets){
      const shell=document.createElement('section');
      shell.className='admin-nav-accordion';
      shell.dataset.adminNavBucket=bucket.id;
      const button=document.createElement('button');
      button.type='button';
      button.className='admin-nav-accordion-toggle';
      button.textContent=bucket.label;
      const panel=document.createElement('div');
      panel.className='admin-nav-accordion-panel';
      panel.dataset.adminNavPanel=bucket.id;
      // Both menu families remain visible at first glance, rather than acting as exclusive accordions.
      button.setAttribute('aria-expanded','true');
      panel.hidden=false;
      for(const [key,label] of bucket.items){
        const a=document.createElement('a');
        a.href=sectionHref(key);
        a.textContent=label;
        a.dataset.adminSection=key;
        if(key===activeKey){
          a.classList.add('active');
          a.setAttribute('aria-current','page');
        }
        panel.append(a);
        if(key==='finance'&&isBizWorkspace&&!service&&canSection('tax',role)&&taxMenu.length){
          const sub=document.createElement('div');
          sub.className='admin-nav-subitems';
          sub.dataset.adminNavGroup='tax';
          const title=document.createElement('span');
          title.className='admin-nav-subitems-label';
          title.textContent='세금 · 증빙';
          sub.append(title);
          for(const item of taxMenu){
            const link=document.createElement('a');
            link.href=item.href;
            link.textContent=item.label;
            link.dataset.adminTaxTab=item.id;
            sub.append(link);
          }
          panel.append(sub);
        }
      }
      button.addEventListener('click',()=>{
        const opening=button.getAttribute('aria-expanded')!=='true';
        button.setAttribute('aria-expanded',String(opening));
        panel.hidden=!opening;
      });
      shell.append(button,panel);
      h.append(shell);
    }
    renderSecondaryNav();
  }
  function publishTenantContext(){if(!workspaceContext)return;document.documentElement.dataset.ekodiTenant=workspaceContext.slug;document.documentElement.dataset.ekodiTenantRole=workspaceRole;document.documentElement.dataset.ekodiAuthorityScope='tenant';document.documentElement.dataset.ekodiAdminSection=section;document.documentElement.dataset.ekodiAdminNavigationProfile=navigationProfile(workspaceRole);const detail={tenantId:workspaceContext.tenantId,workspaceKey:workspaceContext.workspaceKey||`tenant:${workspaceContext.tenantId}`,workspaceName:workspaceContext.name||workspaceLabel(),role:workspaceRole,authorityScope:'tenant',surface:'admin',service:service||'space',capabilities:roleCapabilities(workspaceRole)};window.dispatchEvent(new CustomEvent('ekodi:tenant-context',{detail}));window.dispatchEvent(new CustomEvent('ekodi:context-change',{detail}));window.EKODIAdminUIShell?.refresh?.()}
  function applyWorkspaceContext(context){workspaceContext=context;workspaceRole=String(context?.role||'').trim().toLowerCase();renderNav(workspaceRole);renderAdminScopeSwitcher(workspaceRole);publishTenantContext()}
  function canonicalSubjectKey(){
    if(service==='mall')return 'ekodimall';
    if(service==='trade')return 'ekoditrade';
    // 청계면상인회의 채널 subject는 'cgma'입니다. 인증 문맥 slug 'cheonggye'는 청계잇다('cheonggye-local')와 다릅니다.
    if(workspace==='cgma')return 'cgma';
    const root=workspace==='ekodibiz'?'ekodi-biz':workspace;
    const aliases={'ekodi-biz':'ekodi-biz','ekodichurch':'ekodi-church','ekodi-church':'ekodi-church','ekodilab':'ekodi-lab','ekodi-lab':'ekodi-lab','cheonggye':'cheonggye-local'};
    const raw=String(workspaceContext?.slug||root).trim().toLowerCase();
    return aliases[raw]||raw;
  }
  function channelSiteId(){
    if(service==='mall')return 'mall';
    if(service==='trade')return 'trade';
    return ({
      ekodibiz:'biz','ekodi-biz':'biz',
      ekodichurch:'church','ekodi-church':'church',
      ekodimission:'mission',
      cheonggye:'cheonggye-local','cheonggye-local':'cheonggye-local',
      cgma:'cgma',jadam:'jadam',pizzamaru:'pizzamaru',yogurt:'yogurt'
    })[workspace]||'';
  }

  function languageServiceId(){if(service==='mall')return'mall';if(service)return service;return({'cgma':'cgma','cheonggye':'cgma','ekodibiz':'biz','ekodi-biz':'biz','ekodi-church':'church','ekodi-lab':'lab','ekodi-trade':'trade','ekodimission':'mission'})[workspace]||workspace.replace(/^ekodi-/,'')}
  async function languageApi(path='',options={}){const token=await accessToken();if(!token)throw Object.assign(new Error('AUTH_REQUIRED'),{status:401});const id=languageServiceId();const join=path.includes('?')?'&':'?';const url=LANGUAGE_API+path+join+'service='+encodeURIComponent(id);const r=await fetch(url,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||`language_${r.status}`),{status:r.status});return d}
  function languageStatusLabel(item){return item.status==='source'?'원문':item.status==='published'?'번역완료':item.status==='release-ready'?'게시준비':item.status==='validating'?'검증중':item.status==='translating'?'번역중':item.status==='stale'?'원문변경':'대기'}
  async function languageAdmin(){try{state('다국어 상태 확인 중');const data=await languageApi('/status');const site=data.site||{},rows=Array.isArray(site.languages)?site.languages:[];const published=rows.filter(x=>x.public).length,ready=rows.filter(x=>['source','published'].includes(x.status)).length;$('summaryCards').innerHTML=[card('사이트',site.name||workspaceLabel(),'site scoped'),card('게시 언어',String(published),rows.filter(x=>x.public).map(x=>x.label).join(' · ')||'한국어'),card('번역완료',String(ready),rows.length+'개 등록'),card('권한',data.authority?.role||workspaceRole,'같은 중앙 원장')].join('');const body=rows.map(item=>{const source=item.locale==='ko-KR'||item.status==='source',ready=['source','published'].includes(item.status),next=item.public?'hidden':'published',disabled=source||!ready;return `<div class="service-row"><div><strong>${ae(item.label||item.locale)} · ${ae(item.locale)}</strong><p>번역 ${ae(languageStatusLabel(item))} · 게시 ${item.public?'ON':'OFF'}</p></div><button class="button ${item.public?'':'primary'}" type="button" data-language-toggle="${ae(item.locale)}" data-next="${next}" ${disabled?'disabled':''}>${source?'기본 공개':item.public?'게시 중지':ready?'게시':'번역 준비 중'}</button></div>`}).join('');$('mainPanel').innerHTML=`<h2>다국어 번역·게시</h2><p class="empty">이 사이트의 번역 상태와 게시 여부만 관리합니다. 최고관리자 화면과 같은 중앙 원장을 사용하므로 어느 쪽에서 변경해도 즉시 연동됩니다.</p><div class="service-list">${body}</div><p class="empty">원문이 바뀌면 기존 번역은 자동으로 비게시되어 검증 전 혼합 언어 노출을 막습니다.</p>`;document.querySelectorAll('[data-language-toggle]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;state('게시 상태 변경 중');try{await languageApi('/publication',{method:'PUT',body:JSON.stringify({locale:btn.dataset.languageToggle,publicationStatus:btn.dataset.next})});await languageAdmin()}catch(e){state('변경 실패');$('pageCopy').textContent=e.message;btn.disabled=false}});state('다국어 관리')}catch(e){if(e.status===401)return loginPanel();$('summaryCards').innerHTML=[card('다국어','확인 필요','권한 또는 연결 확인')].join('');$('mainPanel').innerHTML=`<h2>다국어 번역·게시</h2><p class="empty">${ae(e.message)}</p>`;state('확인 필요')}}

  function taxAdmin(){if(!isBizWorkspace)return permissionPanel();$('summaryCards').innerHTML=[card('관리주체','에코디비즈','전용 관리자 메뉴'),card('전문서비스','EKODI Tax','Finance Core 연동'),card('기본 채널','홈택스','FREE-FIRST'),card('자동발행','기본 OFF','명시 승인 전 잠금')].join('');$('mainPanel').innerHTML=`<h2>에코디비즈 세금 · 증빙</h2><p class="empty">전자세금계산서·공급자·거래처·발행대장은 에코디비즈 전용 관리자 메뉴에서 진입하고, 상세 처리는 EKODI Tax 전문서비스에서 같은 Finance Core를 사용합니다.</p><div class="service-list"><div class="service-row"><div><strong>전자세금계산서 · 증빙</strong><p>작성, 승인, 홈택스 발행완료 기록과 발행대장</p></div><a href="/tax">열기</a></div><div class="service-row"><div><strong>결제 · 회계</strong><p>에코디비즈 재무 원장과 함께 관리합니다.</p></div><a href="${ae(sectionHref('finance'))}">관리</a></div></div>`;state('세금 · 증빙');}
  function card(label,value,small=''){return `<article class="card"><span>${label}</span><strong>${value}</strong><small>${small}</small></article>`}
  function state(t){$('pageState').textContent=t}
  function workspaceLabel(){if(service==='mall')return '에코디몰';return({'ekodi-church':'에코디교회','ekodi-biz':'에코디비즈','ekodibiz':'에코디비즈','ekodi-lab':'에코디연구소','ekodi-trade':'EKODI Global Trading','ekoditrade':'EKODI Global Trading','ekodi-cafe':'에코디 카페','ekodimission':'에코디선교회','cgma':'청계면상인회','cheonggye':'청계면상인회'})[workspace]||workspace}
  function workspacePublicUrl(){return service==='mall'?'https://ekodi.kr/ekodimall':'https://ekodi.kr'+base+(service?'/'+service:'')}
  function setup(){const name=workspaceLabel();const owner=service==='mall'?'에코디몰':name;$('workspaceName').textContent=owner;$('scopeLabel').textContent=service==='mall'?'에코디몰':name;$('serviceName').textContent=service==='mall'?'에코디몰 관리':service?service+' 관리':'운영관리';$('publicLink').href=workspacePublicUrl();$('breadcrumb').textContent=service==='mall'?'에코디몰 관리':service?`${name} / ${service} / ADMIN`:`${name} / ADMIN`;const [t,c]=meta[section]||meta.overview;const displayTitle=workspace==='ekodimission'&&section==='activities'?'행사 · 신청자':t;$('pageTitle').textContent=displayTitle;$('pageCopy').textContent=service==='mall'&&section==='overview'?'에코디몰의 상품·판매·채널·AI 영업 상태와 다음 행동을 한 화면에서 확인합니다.':c;document.title=`${displayTitle} · ${service==='mall'?'에코디몰 관리자':name}`;renderNav()}
  function storedSession(){try{const v=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return v?.accessToken?v:null}catch{return null}}
  function saveSession(v){sessionStorage.setItem(SESSION_KEY,JSON.stringify(v))}
  function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
  function designAuthUrl(){const u=new URL(AUTH_URL);u.searchParams.set('site','space');u.searchParams.set('return_to',location.origin+location.pathname+location.search);return u.href}
  function authUrl(){const u=new URL(AUTH_URL);u.searchParams.set('site','mail');u.searchParams.set('return_to',location.origin+location.pathname+location.search);return u.href}
  async function supabaseAuth(path,body){const r=await fetch(SUPABASE_URL+path,{method:'POST',headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.msg||d.error_description||d.error||`auth_${r.status}`),{status:r.status});return d}
  function normalizeAuthSession(d,current={}){return{accessToken:d.access_token||'',refreshToken:d.refresh_token||current.refreshToken||'',expiresIn:Number(d.expires_in||3600),expiresAt:Number(d.expires_at||0)||Math.floor(Date.now()/1000)+Number(d.expires_in||3600),user:{id:d.user?.id||current.user?.id||'',email:d.user?.email||current.user?.email||''}}}
  async function exchangeCentralToken(){const p=new URLSearchParams(location.hash.slice(1));const tokenHash=p.get('ekodi_token');if(!tokenHash)return storedSession();const d=await supabaseAuth('/auth/v1/verify',{token_hash:tokenHash,type:p.get('ekodi_type')||'email'});const session=normalizeAuthSession(d);if(!session.accessToken)throw new Error('로그인 연결에 실패했습니다.');saveSession(session);clearWorkspaceSsoRecovery();clearWorkspaceSsoSuppression();history.replaceState(null,'',location.pathname+location.search);return session}
  async function accessToken(){let s=storedSession();if(!s?.accessToken)return'';const now=Math.floor(Date.now()/1000);if(!s.expiresAt||Number(s.expiresAt)>now+60)return s.accessToken;if(!s.refreshToken){clearSession();return''}try{const d=await supabaseAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refreshToken});const session=normalizeAuthSession(d,s);if(!session.accessToken){clearSession();return''}saveSession(session);return session.accessToken}catch{clearSession();return''}}
  function preferredWorkspaceSlug(){
    if(service==='mall')return 'ekodimall';
    if(service==='trade')return 'ekoditrade';
    if(workspace==='cheonggye')return 'cheonggye-local';
    const preferred={'ekodibiz':'ekodi-biz','ekodichurch':'ekodi-church','ekodilab':'ekodi-lab'};
    return preferred[workspace]||workspace;
  }
  function workspaceSlugs(){
    if(service==='mall')return new Set(['ekodimall']);
    if(service==='trade')return new Set(['ekoditrade','ekodi-trade','ekodibiz-trade']);
    const values=new Set([workspace,preferredWorkspaceSlug()]);
    if(workspace==='ekodibiz')values.add('ekodi-biz');
    if(workspace==='ekodi-biz')values.add('ekodibiz');
    if(workspace==='ekodichurch')values.add('ekodi-church');
    if(workspace==='ekodi-church')values.add('ekodichurch');
    if(workspace==='ekodilab')values.add('ekodi-lab');
    if(workspace==='ekodi-lab')values.add('ekodilab');
    if(workspace==='cgma')values.add('cheonggye');
    if(workspace==='cheonggye')values.add('cheonggye-local');
    return values;
  }
  async function loadWorkspaceContext(){
    const token=await accessToken();if(!token)return null;
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_activity_contexts`,{method:'POST',headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)});
    const rows=await r.json().catch(()=>[]);if(!r.ok)throw Object.assign(new Error(rows?.message||rows?.error||`context_${r.status}`),{status:r.status});
    const list=Array.isArray(rows)?rows:[],preferred=preferredWorkspaceSlug(),slugs=workspaceSlugs();
    const item=list.find(row=>String(row?.tenant||'').trim().toLowerCase()===preferred)||list.find(row=>slugs.has(String(row?.tenant||'').trim().toLowerCase()));
    if(!item?.tenant_id)return null;
    const authorizedAdminScopeIds=adminHubScopes.filter(scope=>(scope.tenantSlugs||[]).some(alias=>list.some(row=>
      String(row?.tenant||'').trim().toLowerCase()===alias&&
      String(row?.authorization_role||'').trim().toLowerCase()!=='platform_admin'&&
      hasFullWorkspaceAdminScope(row?.authorization_role)
    ))).map(scope=>scope.id);
    return{tenantId:String(item.tenant_id),workspaceKey:String(item.workspace_key||''),slug:String(item.tenant||preferred||workspace).trim().toLowerCase(),name:String(item.workspace_name||workspaceLabel()),kind:String(item.workspace_kind||'organization'),role:String(item.authorization_role||'').trim().toLowerCase(),authorizedAdminScopeIds};
  }
  function workspaceAuthSite(){if(workspace==='cgma')return'cgma';if(workspace==='ekodimission')return'mission';return'space'}
  const MISSION_RETURN_KEY='ekodi-mission-admin-return';
  function rememberMissionReturn(){if(workspace!=='ekodimission')return;try{sessionStorage.setItem(MISSION_RETURN_KEY,JSON.stringify({adminBase,path:location.pathname+location.search,createdAt:Date.now()}))}catch{}}
  function consumeMissionReturn(){if(workspace!=='ekodimission')return'';try{const raw=JSON.parse(sessionStorage.getItem(MISSION_RETURN_KEY)||'null');if(!raw||raw.adminBase!==adminBase||Date.now()-Number(raw.createdAt||0)>600000){sessionStorage.removeItem(MISSION_RETURN_KEY);return''}const target=new URL(String(raw.path||''),location.origin);if(target.origin!==location.origin||!(target.pathname===adminBase||target.pathname.startsWith(adminBase+'/'))){sessionStorage.removeItem(MISSION_RETURN_KEY);return''}const next=target.pathname+target.search,current=location.pathname+location.search;sessionStorage.removeItem(MISSION_RETURN_KEY);return next===current?'':next}catch{try{sessionStorage.removeItem(MISSION_RETURN_KEY)}catch{}return''}}
  function workspaceAuthUrl(){const u=new URL(AUTH_URL);u.searchParams.set('site',workspaceAuthSite());u.searchParams.set('return_to',location.origin+location.pathname+location.search);u.searchParams.set('direct','1');return u.href}
  function workspaceSsoRecovery(){try{const value=JSON.parse(sessionStorage.getItem(ADMIN_SSO_RECOVERY_KEY)||'null');return value&&typeof value==='object'?value:null}catch{return null}}
  function clearWorkspaceSsoRecovery(){try{sessionStorage.removeItem(ADMIN_SSO_RECOVERY_KEY)}catch{}}
  function workspaceSsoSuppressed(){try{return sessionStorage.getItem(ADMIN_SSO_SUPPRESS_KEY)==='1'}catch{return false}}
  function clearWorkspaceSsoSuppression(){try{sessionStorage.removeItem(ADMIN_SSO_SUPPRESS_KEY)}catch{}}
  function suppressWorkspaceSsoRecovery(){try{sessionStorage.setItem(ADMIN_SSO_SUPPRESS_KEY,'1')}catch{};clearWorkspaceSsoRecovery()}
  function beginWorkspaceSsoRecovery(){
    if(workspaceSsoSuppressed())return false;
    const path=location.pathname+location.search,prior=workspaceSsoRecovery(),now=Date.now();
    if(prior?.path===path&&now-Number(prior.at||0)<ADMIN_SSO_RECOVERY_MAX_AGE_MS)return false;
    try{sessionStorage.setItem(ADMIN_SSO_RECOVERY_KEY,JSON.stringify({path,at:now}))}catch{}
    state('관리자 로그인 상태 복원 중');
    location.replace(workspaceAuthUrl());
    return true;
  }
  async function channelPreAuth(){return loginPanel('운영공간 로그인 후 등록된 게시계정별 인증 버튼을 사용할 수 있습니다.')}
  function loginPanel(message='운영공간 관리에는 권한 있는 계정 로그인이 필요합니다.'){
    if(service==='mall'){
      $('summaryCards').innerHTML='';
      $('mainPanel').innerHTML=`<div class="mall-login-guide"><div class="mall-login-step"><strong>에코디몰 관리자 로그인</strong><p>${ae(message)} 로그인 전에는 상품·주문·채널·수익·AI 영업의 실제 수치를 표시하지 않습니다.</p></div><div class="actions"><a class="button primary" id="workspaceLoginButton" href="${workspaceAuthUrl()}">관리자 로그인</a><a class="button" href="${workspacePublicUrl()}" target="_blank" rel="noopener">고객 화면 보기</a></div><p class="mall-proof">관리자 로그인 상태가 있으면 자동으로 복원합니다. YouTube 등 외부 채널은 최초 연결 또는 실제 연결 복구가 필요할 때만 별도 승인을 요청합니다.</p></div>`;
    }else{
      $('summaryCards').innerHTML=[card('운영공간',workspaceLabel(),'tenant scoped'),card('현재 상태','로그인 전','운영 데이터 비공개'),card('게시계정','로그인 후 등록','계정별 인증'),card('사용자 화면','공개','관리자와 분리')].join('');
      $('mainPanel').innerHTML=`<h2>운영공간 로그인</h2><p class="empty">${ae(message)}</p><div class="actions"><a class="button primary" id="workspaceLoginButton" href="${workspaceAuthUrl()}">Google 계정으로 계속</a><a class="button" href="${workspacePublicUrl()}">사용자 화면</a></div><p class="empty">로그인 후 채널·자동게시에서 여러 계정을 등록하고 각 계정별 인증을 진행합니다.</p>`;
    }
    $('workspaceLoginButton')?.addEventListener('click',()=>{clearWorkspaceSsoRecovery();clearWorkspaceSsoSuppression();rememberMissionReturn()},{once:true});
    state('로그인 필요');
  }
  function den…39901 tokens truncated…SocialTestForm');
      if(pilotForm)pilotForm.addEventListener('submit',async event=>{
        event.preventDefault();
        const output=$('mallSocialTestResult');
        const fd=new FormData(pilotForm),channelId=Number(fd.get('channelId'));
        const assetUrl=String(fd.get('assetUrl')||'').trim(),linkUrl=String(fd.get('linkUrl')||'').trim();
        if(!connectedPilotChannels.some(c=>Number(c.id)===channelId)){if(output)output.textContent='선택한 SNS의 OAuth 연결 상태를 다시 확인하세요.';return}
        if(![assetUrl,linkUrl].every(value=>{try{return new URL(value).protocol==='https:'}catch{return false}})){if(output)output.textContent='이미지와 링크 주소는 HTTPS여야 합니다.';return}
        if(!window.confirm('선택한 SNS에 시험 게시물이 실제 공개될 수 있습니다. 지금 게시 요청을 진행할까요?'))return;
        const button=pilotForm.querySelector('button[type=submit]');if(button)button.disabled=true;
        if(output)output.textContent='SNS 시험 게시를 접수하고 있습니다…';
        try{
          const result=await automationApi('/v1/publish',{method:'POST',body:JSON.stringify({channelIds:[channelId],scheduledAt:new Date().toISOString(),requestedBy:'human',content:{title:String(fd.get('title')||'').trim(),caption:String(fd.get('caption')||'').trim(),assetUrl,linkUrl,contentType:'social_post',source:'human'}})});
          if(output)output.textContent='접수됨: '+(result.jobs||[]).map(job=>'#'+job.id+' '+job.status).join(', ')+'. 실제 발행 성공 여부는 아래 최근 게시 작업에서 확인하세요.';
          state('시험 게시 접수');
        }catch(error){if(output)output.textContent='시험 게시 실패: '+String(error?.message||error);state('시험 게시 확인 필요')}
        finally{if(button)button.disabled=false}
      });
      const accountEl=$('channelAccountForm');if(accountEl)accountEl.onsubmit=async e=>{e.preventDefault();const fd=new FormData(accountEl),provider=String(fd.get('provider')||''),account=String(fd.get('account')||'').trim(),displayName=String(fd.get('displayName')||'').trim(),target=CHANNEL_TARGETS.get(provider),map=registryProvider(provider);let oauthPopup=null;try{if(provider==='youtube'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account))throw new Error('YouTube는 인증할 Google 이메일을 입력해 주세요.');const alreadyActive=registeredAccounts.find(a=>channelProviderFromRegistry(a)===provider&&a.status==='active'&&String(a.providerAccountId||a.loginHint||'').trim().toLowerCase()===account.toLowerCase());if(alreadyActive&&oauthLinkedForAccount(alreadyActive)){state('연결 유지');if($('pageCopy'))$('pageCopy').textContent='이미 연결된 계정입니다. 추가 OAuth 승인 없이 관리자 로그인으로 계속 사용합니다.';await channel();return}if(provider==='youtube'&&target?.automationAdapter&&platform[target.healthKey])oauthPopup=window.open('about:blank',CHANNEL_OAUTH_POPUP_NAME,'popup,width=560,height=760,resizable=yes,scrollbars=yes');if(oauthPopup){try{oauthPopup.document.title='EKODI YouTube 인증';oauthPopup.document.body.innerHTML='<p style="font-family:system-ui,sans-serif;padding:24px">YouTube 계정 등록 후 Google 인증을 시작합니다.</p>';oauthPopup.opener=null}catch{}}state('계정 등록 중');const capabilities=target?.automationAdapter?['channel.publish']:provider==='naver_blog'?['channel.share']:['channel.manage'];let registered=null;try{registered=await externalAccountApi('/accounts',{method:'POST',body:JSON.stringify({workspaceSlug:canonicalSubjectKey(),provider:map.provider,serviceKey:map.serviceKey,providerAccountId:account,loginHint:provider==='youtube'?account:'',displayName:displayName||account,connectionMode:map.connectionMode,capabilities,authorityRef:channelRegistryAuthority()})})}catch(error){if(error.code!=='account_already_registered')throw error;const summary=await externalAccountApi('/summary?workspace='+encodeURIComponent(canonicalSubjectKey()));const existing=registeredChannelAccounts(summary).find(a=>channelProviderFromRegistry(a)===provider&&String(a.providerAccountId||a.loginHint||'').trim().toLowerCase()===account.toLowerCase());if(!existing)throw error;registered={id:existing.id,status:existing.status,existing:true}}if(provider==='youtube'&&registered?.status==='active'&&oauthLinkedForAccount({...registered,provider:map.provider,serviceKey:map.serviceKey,loginHint:account})){try{if(oauthPopup&&!oauthPopup.closed)oauthPopup.close()}catch{}state('연결 유지');if($('pageCopy'))$('pageCopy').textContent='이미 연결된 YouTube 계정입니다. 추가 OAuth 승인 없이 관리자 로그인으로 계속 사용합니다.';await channel();return}if(provider==='youtube'&&target?.automationAdapter&&platform[target.healthKey]){state(registered?.existing?'YouTube 재연결 준비':'YouTube 계정 등록 완료 · 최초 연결 준비');await startChannelConnect(provider,{id:registered.id,loginHint:account,providerAccountId:account,displayName:displayName||account,status:registered.status,youtubeBrandAccountMode:fd.get('youtubeBrandAccountMode')==='on'},oauthPopup);return}try{if(oauthPopup&&!oauthPopup.closed)oauthPopup.close()}catch{}await channel()}catch(e){try{if(oauthPopup&&!oauthPopup.closed)oauthPopup.close()}catch{}state('계정 등록 확인 필요');$('pageCopy').textContent=e.message}};
      const youtubeQuick=$('mallSocialYoutubeConnectForm');
      if(youtubeQuick)youtubeQuick.onsubmit=e=>{
        e.preventDefault();
        const email=String(new FormData(youtubeQuick).get('email')||'').trim();
        const target=accountEl?.querySelector('[name="provider"]'),field=accountEl?.querySelector('[name="account"]');
        const note=$('mallSocialYoutubeMessage');
        if(!accountEl||!target||!field||!email){if(note)note.textContent='계정 연결 입력란을 불러올 수 없습니다. 새로고침 후 다시 시도하세요.';return}
        target.value='youtube';field.value=email;
        const brand=accountEl.querySelector('[name="youtubeBrandAccountMode"]');if(brand)brand.checked=new FormData(youtubeQuick).get('youtubeBrandAccountMode')==='on';
        const name=accountEl.querySelector('[name="displayName"]');if(name&&!name.value.trim())name.value=email;
        if(note)note.textContent='Google OAuth 연결을 준비합니다…';
        accountEl.requestSubmit();
      };
      const refreshConnection=$('mallSocialVerifyConnection');if(refreshConnection)refreshConnection.onclick=async()=>{refreshConnection.disabled=true;try{await channel()}finally{refreshConnection.disabled=false}};
      document.querySelectorAll('[data-account-auth]').forEach(btn=>btn.onclick=async()=>{try{const account=registeredAccounts.find(a=>String(a.id)===String(btn.dataset.accountAuth));if(!account)throw new Error('등록 계정을 찾을 수 없습니다.');state(`${CHANNEL_PROVIDERS[btn.dataset.provider]?.label||btn.dataset.provider} 인증 준비`);await startChannelConnect(btn.dataset.provider,{...account,youtubeBrandAccountMode:btn.dataset.provider==='youtube'&&Boolean(brandModeInputs.some(box=>box.checked))})}catch(e){state('인증 확인 필요');$('pageCopy').textContent=e.message}});
      const policyEl=$('channelPolicyForm');if(policyEl)policyEl.onsubmit=async e=>{e.preventDefault();state('공통 정책 저장 중');const fd=new FormData(policyEl),providers=policyTargets.filter(target=>fd.has('provider:'+target.id)).map(target=>target.id);await automationApi('/v1/policy',{method:'PUT',body:JSON.stringify({mode:fd.get('mode'),maxDailyPosts:Number(fd.get('maxDailyPosts')||3),allowedProviders:providers,quietHours:{timezone:'Asia/Seoul',start:fd.get('start')||'08:00',end:fd.get('end')||'22:00'}})});await channel()};
      const aiEl=$('channelAiForm');if(aiEl)aiEl.onsubmit=async e=>{e.preventDefault();state('AI 배분 설정 저장 중');const fd=new FormData(aiEl),next=JSON.parse(JSON.stringify(growthPolicy));next.channels=(next.channels||[]).map(x=>({...x,enabled:fd.has('ai:'+x.id)}));await mallGrowthControl({method:'PUT',body:JSON.stringify({policy:next})});await channel()};
      document.querySelectorAll('[data-channel-control]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();state('채널 · 사이트 설정 저장 중');const fd=new FormData(form),channelId=encodeURIComponent(form.dataset.channelControl);await automationApi(`/v1/channels/${channelId}/settings`,{method:'PUT',body:JSON.stringify({autoPublishEnabled:fd.get('autoPublishEnabled')==='on',maxPostsPerDay:Number(fd.get('maxPostsPerDay')||0),minHoursBetweenPosts:Number(fd.get('minHoursBetweenPosts')||0),maxAttempts:Number(fd.get('maxAttempts')||5),publishWindowStart:fd.get('publishWindowStart')||'',publishWindowEnd:fd.get('publishWindowEnd')||'',timezone:'Asia/Seoul'})});const siteId=channelSiteId();if(siteId)await automationApi(`/v1/sites/${encodeURIComponent(siteId)}/channels/${channelId}`,{method:'PUT',body:JSON.stringify({enabled:fd.get('siteEnabled')==='on',role:'primary',isDefault:fd.get('siteDefault')==='on',autoArchive:fd.get('autoArchive')==='on',archiveCategory:'past-event',priority:10})});await channel()});
      document.querySelectorAll('[data-channel-disconnect]').forEach(btn=>btn.onclick=async()=>{try{state('채널 연결 해제 중');await growth(`/v1/connections/${encodeURIComponent(btn.dataset.channelDisconnect)}/disconnect`,{method:'POST',body:'{}'});await channel()}catch(e){state('연결 해제 확인 필요');$('pageCopy').textContent=e.message}});
      document.querySelectorAll('[data-job-action]').forEach(btn=>btn.onclick=async()=>{try{state('게시 작업 처리 중');await automationApi(`/v1/jobs/${encodeURIComponent(btn.dataset.jobId)}/${btn.dataset.jobAction}`,{method:'POST',body:'{}'});await channel()}catch(e){state('게시 작업 확인 필요');$('pageCopy').textContent=e.message}});
      document.querySelectorAll('[data-channel-save]').forEach(btn=>btn.onclick=async()=>{const form=btn.closest('[data-channel-settings-form]');if(!form)return;state('YouTube 채널 설정 저장 중');const fd=new FormData(form);const payload={role:fd.get('role'),isDefault:fd.get('isDefault')==='on',publishPrivacy:fd.get('publishPrivacy'),categoryId:fd.get('categoryId'),country:fd.get('country'),defaultLanguage:fd.get('defaultLanguage'),description:fd.get('description'),keywords:fd.get('keywords'),unsubscribedTrailer:fd.get('unsubscribedTrailer'),syncToYouTube:btn.dataset.channelSave==='youtube'};try{await growth(`/v1/connections/${encodeURIComponent(form.dataset.channelSettingsForm)}/settings`,{method:'POST',body:JSON.stringify(payload)});await channel()}catch(e){state('YouTube 설정 확인 필요');$('pageCopy').textContent=e.message}});

      document.querySelectorAll('[data-channel-quick]').forEach(btn=>btn.onclick=()=>{const form=$('channelAccountForm');if(!form)return;const provider=String(btn.dataset.channelQuick||''),section=document.getElementById('channel-account-section');if(section?.tagName==='DETAILS')section.open=true;const advanced=$('mall-sns-advanced');if(advanced)advanced.open=true;const select=form.querySelector('[name="provider"]');if(select&&provider&&[...select.options].some(option=>option.value===provider))select.value=provider;section?.scrollIntoView({behavior:'smooth',block:'start'});form.querySelector('[name="account"]')?.focus()});
      document.querySelectorAll('[data-channel-panel]').forEach(btn=>btn.onclick=()=>{const panel=document.getElementById(btn.dataset.channelPanel);if(!panel)return;if(panel.tagName==='DETAILS')panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'})});
      if(channelOAuthNotice){
        const notice=channelOAuthNotice;channelOAuthNotice=null;
        const ok=channelOAuthConfirmed(notice,connections);
        const label=CHANNEL_PROVIDERS[notice.provider]?.label||notice.provider||'채널';
        if($('pageCopy'))$('pageCopy').textContent=channelOAuthCopy(notice,ok,label);
        state(ok?'채널 연결 완료':'채널 연결 확인 필요');
      }else state('채널 설정');
    }catch(e){if(e.status===401)return loginPanel('채널 연결에는 운영공간 로그인이 필요합니다.');$('mainPanel').innerHTML=`<h2>채널 통합관리</h2><p class="empty">${ae(e.message)}</p>`;state('확인 필요')}
  }

  const MEMBER_ROLE_LABELS=Object.freeze({owner:'사이트 책임관리자',admin:'사이트 관리자',manager:'운영책임자',marketer:'마케팅담당자',accountant:'회계담당자',staff:'실무담당자',member:'회원',viewer:'조회·검수자',marketing_manager:'마케팅담당자',accounting_manager:'회계담당자',hq_manager:'본사담당자',pastor:'목회자',care_staff:'돌봄담당자'});
  const ADMIN_ROLE_SET=new Set(['owner','admin','manager','tenant_admin','workspace_admin','client_admin','store_owner','senior_pastor']);
  const memberStatusLabel=value=>({active:'활성',pre_registered:'Google 인증 대기',disabled:'중지',expired:'기간 만료'})[value]||value||'확인 필요';
  function memberRoleOptions(current,allowed=null){const raw=Array.isArray(allowed)&&allowed.length?allowed.map(item=>typeof item==='string'?{role:item,label:MEMBER_ROLE_LABELS[item]||item}:item):Object.keys(MEMBER_ROLE_LABELS).map(role=>({role,label:MEMBER_ROLE_LABELS[role]||role}));const source=raw.filter(item=>Boolean(MEMBER_ROLE_LABELS[item.role])||item.role===current);const roles=new Map(source.map(item=>[item.role,item.label||MEMBER_ROLE_LABELS[item.role]||item.role]));if(current&&!roles.has(current))roles.set(current,MEMBER_ROLE_LABELS[current]||current);return [...roles].map(([role,label])=>'<option value="'+ae(role)+'" '+(role===current?'selected':'')+'>'+ae(label)+'</option>').join('')}
  async function memberAccessApi(path='',options={}){const token=await accessToken();if(!token)throw Object.assign(new Error('AUTH_REQUIRED'),{status:401,code:'AUTH_REQUIRED'});const headers={'content-type':'application/json',authorization:'Bearer '+token,...(options.headers||{})};const response=await fetch('/api/customers'+path,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||('member_access_'+response.status)),{status:response.status,code:data.code});return data}
  async function membersAdmin(){
    $('summaryCards').hidden=true;
    try{
      await exchangeCentralToken();if(!(await accessToken()))return loginPanel('사용자·권한 관리에는 운영공간 로그인이 필요합니다.');
      state('사용자·권한 확인 중');const tenant=workspace;const data=await memberAccessApi('/directory?tenant='+encodeURIComponent(tenant));const members=Array.isArray(data.members)?data.members:[];const administrators=members.filter(m=>ADMIN_ROLE_SET.has(m.role));const active=members.filter(m=>m.status==='active').length,pending=members.filter(m=>m.status==='pre_registered').length;
      const newAssignable=Array.isArray(data.authority?.assignableRoles)?data.authority.assignableRoles:[];const defaultNewRole=(newAssignable.find(item=>item.role==='admin')||newAssignable[0]||{role:'member'}).role;
      $('summaryCards').hidden=true;
      const accessTabs='<nav class="access-filter-tabs" role="group" aria-label="사용자 목록 필터">'+[['all','전체 사용자',members.length],['admin','관리자',administrators.length],['active','활성',active],['pre_registered','인증 대기',pending]].map(([key,label,count])=>'<button type="button" class="access-filter-tab" data-member-filter="'+key+'" aria-pressed="'+(key==='all'?'true':'false')+'">'+label+' <strong>'+count+'</strong></button>').join('')+'</nav>';
      const rows=members.map(m=>{const manageable=Boolean(m.canManage),inactive=['disabled','expired'].includes(m.status);const roleControl=manageable?'<select data-member-role="'+ae(m.email)+'">'+memberRoleOptions(m.role,m.assignableRoles)+'</select>':'<span class="tag">'+ae(m.roleLabel||m.role)+'</span>';const actions=manageable?'<button class="button" type="button" data-member-save="'+ae(m.email)+'" data-member-current-status="'+ae(m.status)+'">저장</button><button class="button" type="button" data-member-toggle="'+ae(m.email)+'" data-member-status="'+ae(m.status)+'">'+(inactive?'재활성':'중지')+'</button>':'<span class="tag">보호됨</span>';return '<tr data-member-status="'+ae(m.status||'')+'" data-member-admin="'+(ADMIN_ROLE_SET.has(m.role)?'1':'0')+'"><td><strong>'+ae(m.displayName||m.email)+'</strong><br><small>'+ae(m.email)+'</small></td><td>'+roleControl+'</td><td><span class="tag '+(m.status==='active'?'live':inactive?'warn':'')+'">'+ae(memberStatusLabel(m.status))+'</span></td><td>'+ae(m.lastLoginAt?new Date(m.lastLoginAt).toLocaleString('ko-KR'):'아직 로그인 전')+'</td><td><div class="actions">'+actions+'</div></td></tr>'}).join('');
      $('mainPanel').innerHTML='<div class="panel-head"><div><h2>관리자 목록 · 사용자 권한</h2><p class="empty">현재 관리자와 사용자를 한 원장에서 확인합니다. 책임관리자는 관리자 이하를, 관리자는 자기보다 낮은 역할만 변경할 수 있습니다.</p></div></div><form id="memberAccessForm" class="trade-form"><div class="trade-grid"><label>이름<input name="displayName" maxlength="120" placeholder="이름"></label><label>Google 이메일<input name="email" type="email" required placeholder="user@gmail.com"></label><label>권한 등급<select name="role">'+memberRoleOptions(defaultNewRole,newAssignable)+'</select></label></div><div class="actions"><button class="button primary" type="submit">등록 · 재활성</button></div></form>'+accessTabs+'<p id="memberFilterEmpty" hidden>해당 조건의 사용자가 없습니다.</p><div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>관리자·사용자</th><th>권한</th><th>상태</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5">등록된 사용자가 없습니다.</td></tr>')+'</tbody></table></div><p class="empty">자기 자신과 동급·상위 관리자, 사이트 책임관리자, 플랫폼 최고관리자는 보호됩니다. 책임관리자는 관리자 이하를, 관리자는 자기보다 낮은 역할만 설정할 수 있으며 모든 변경은 감사기록에 남습니다.</p>';
      const accessFilterButtons=[...document.querySelectorAll('#mainPanel [data-member-filter]')];for(const button of accessFilterButtons)button.addEventListener('click',()=>{const choice=button.dataset.memberFilter;for(const tab of accessFilterButtons)tab.setAttribute('aria-pressed',String(tab===button));let visible=0;for(const row of document.querySelectorAll('#mainPanel tbody tr[data-member-status]')){const match=choice==='all'||(choice==='admin'&&row.dataset.memberAdmin==='1')||row.dataset.memberStatus===choice;row.hidden=!match;if(match)visible++}const empty=$('memberFilterEmpty');if(empty)empty.hidden=visible>0||members.length===0});
      const form=$('memberAccessForm');form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form).entries());try{state('등록 중');await memberAccessApi('/tenants/'+encodeURIComponent(tenant)+'/pre-register',{method:'POST',body:JSON.stringify(values)});await membersAdmin()}catch(err){state('등록 실패');$('pageCopy').textContent=err.message}};
      document.querySelectorAll('[data-member-save]').forEach(button=>button.onclick=async()=>{const email=button.dataset.memberSave,select=document.querySelector('[data-member-role="'+CSS.escape(email)+'"]'),currentStatus=button.dataset.memberCurrentStatus;try{state('권한 저장 중');await memberAccessApi('/tenants/'+encodeURIComponent(tenant)+'/access/update',{method:'POST',body:JSON.stringify({email,role:select?.value||'member',status:currentStatus==='disabled'?'disabled':'active'})});await membersAdmin()}catch(err){state('저장 실패');$('pageCopy').textContent=err.message}});
      document.querySelectorAll('[data-member-toggle]').forEach(button=>button.onclick=async()=>{const email=button.dataset.memberToggle,status=button.dataset.memberStatus,inactive=['disabled','expired'].includes(status);try{state(inactive?'재활성 중':'중지 중');if(inactive){const select=document.querySelector('[data-member-role="'+CSS.escape(email)+'"]'),payload={email,role:select?.value||'member',status:'active'};if(status==='expired')payload.expiresAt='';await memberAccessApi('/tenants/'+encodeURIComponent(tenant)+'/access/update',{method:'POST',body:JSON.stringify(payload)})}else{await memberAccessApi('/tenants/'+encodeURIComponent(tenant)+'/access/revoke',{method:'POST',body:JSON.stringify({email})})}await membersAdmin()}catch(err){state('변경 실패');$('pageCopy').textContent=err.message}});
      state('운영');
    }catch(e){if(e.status===401)return loginPanel('사용자·권한 관리에는 운영공간 로그인이 필요합니다.');$('summaryCards').hidden=true;$('mainPanel').innerHTML='<h2>사용자 · 관리자 · 권한</h2><p class="empty">'+ae(e.message)+'</p>';state('확인 필요')}
  }

  async function financeAdmin(){const moduleUrl=new URL('/tenant-finance-admin.js?v=e6f7c5d4e37d',location.origin).href;const module=await import(moduleUrl);return module.mountTenantBankingAdmin({root:$('mainPanel'),summaryRoot:$('summaryCards'),getToken:accessToken,workspace,state,mode:'workspace'});}
  async function cgmaEmbeddedAdmin(key){
    if(workspace!=='cgma')return permissionPanel();
    const panel=CGMA_EMBEDDED_PANELS[key];
    if(!panel)return permissionPanel();
    const token=await accessToken();
    if(!token)return loginPanel();
    const summary=$('summaryCards'),host=$('mainPanel');
    summary.replaceChildren();host.replaceChildren();
    const frame=document.createElement('iframe');
    frame.className='cgma-embedded-admin-frame';
    frame.title=meta[key]?.[0]||'청계면상인회 관리자';
    frame.referrerPolicy='no-referrer';
    frame.loading='eager';
    frame.style.cssText='display:block;width:100%;height:70vh;min-height:360px;max-width:100%;border:0;border-radius:10px;background:white';
    frame.src=new URL('/cgma/operations-admin/?inline=1&section='+encodeURIComponent(panel),location.origin).href;
    // An unmerged Pages alias must not render an unrelated public page in an admin frame.
    try{
      const check=await fetch(frame.src,{cache:'no-store',redirect:'error',headers:{accept:'text/html'}});
      const markup=check.ok?await check.text():'';
      if(!markup.includes('async function embeddedSession()'))throw new Error('CGMA_WORKBENCH_NOT_RELEASED');
    }catch{
      const notice=document.createElement('p');notice.className='empty';
      notice.textContent='통합 관리화면의 배포 연결을 확인하고 있습니다. 기존 상인회 관리자 화면은 계속 이용할 수 있습니다.';
      const link=document.createElement('a');link.href='https://cgma.or.kr/admin/';link.className='button';
      link.textContent='기존 관리자 화면';link.rel='noopener noreferrer';
      host.append(notice,link);state('연결 확인 필요');return;
    }
    const receive=event=>{
      if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
      if(event.data?.type==='ekodi:cgma-admin:ready'&&event.data.section===panel){
        frame.contentWindow.postMessage({type:'ekodi:cgma-admin:session',accessToken:token},location.origin);
        state('상인회 관리자 연결 확인 중');
      }
      if(event.data?.type==='ekodi:cgma-admin:height'){
        const h=Number(event.data.height);if(Number.isFinite(h)&&h>=260&&h<=5000)frame.style.height=Math.ceil(h+16)+'px';
      }
    };
    window.addEventListener('message',receive);
    window.addEventListener('pagehide',()=>window.removeEventListener('message',receive),{once:true});
    host.append(frame);
    state('상인회 관리자 연결 중');
  }
  async function cgmaEdocAdmin(){const moduleUrl=new URL('/cgma/admin/assets/cgma-edoc-admin.js?v=edocs-27c327f21d',location.origin).href;const module=await import(moduleUrl);return module.mountCgmaEdocAdmin({root:$('mainPanel'),summaryRoot:$('summaryCards'),getToken:accessToken,state})}
  async function cgmaFestivalAdmin(){const moduleUrl=new URL('/cgma/admin/assets/cgma-motor-festival-admin.js?v=20261019-festival-1',location.origin).href;const module=await import(moduleUrl);return module.mountCgmaMotorFestivalAdmin({root:$('mainPanel'),summaryRoot:$('summaryCards'),getToken:accessToken,state})}
  async function cgmaMemberAdmin(){const moduleUrl=new URL('/cgma/admin/assets/cgma-member-admin.js?v=member-f0b1b6e543',location.origin).href;const module=await import(moduleUrl);return module.mountCgmaMemberAdmin({root:$('mainPanel'),summaryRoot:$('summaryCards'),getToken:accessToken,state,workspaceRole})}
  function statusAdmin(){const name=workspaceLabel();$('summaryCards').innerHTML=[card('운영공간',name,'tenant scoped'),card('인증','연결됨','운영공간 권한 확인 완료'),card('공개주소',workspacePublicUrl().replace('https://ekodi.kr',''),'사용자 화면'),card('내 권한',workspaceRole||'-','Capability 기준')].join('');$('mainPanel').innerHTML=`<div class="panel-head"><div><h2>운영 상태</h2><p class="empty">사이트 운영 상태와 접근 경계를 확인합니다. 실제 플랫폼 배포 이력과 장애·로그는 공통 최고관리자에서 분리 관리합니다.</p></div><span class="tag live">관리자 연결 정상</span></div><div class="service-list"><div class="service-row"><div><strong>공개 사용자 화면</strong><p>${ae(workspacePublicUrl())}</p></div><a href="${ae(workspacePublicUrl())}" target="_blank" rel="noopener">열기</a></div><div class="service-row"><div><strong>운영공간 관리자</strong><p>${ae(adminBase)}</p></div><a href="${ae(adminBase)}">새로 확인</a></div><div class="service-row"><div><strong>플랫폼 상태 · 배포</strong><p>공통 배포·검증·오류 상태는 플랫폼 최고관리자 범위입니다.</p></div><a href="/admin/">최고관리자</a></div></div>`;state('운영 상태 확인됨')}
  function recordsAdmin(){$('summaryCards').innerHTML=[card('권한 경계','운영공간','tenant-local'),card('변경 처리','권한 기반','Capability 검증'),card('개인정보','분리 관리','공개 화면과 분리'),card('감사 기준','원본 유지','관리 작업 추적')].join('');const links=[];if(canSection('members'))links.push(`<div class="service-row"><div><strong>사용자 · 관리자 권한</strong><p>누가 어떤 범위에서 관리할 수 있는지 확인합니다.</p></div><a href="${sectionHref('members')}">관리</a></div>`);if(canSection('confirmations'))links.push(`<div class="service-row"><div><strong>지급 · 수령 기록</strong><p>확인서와 거래 연결 기록을 관리합니다.</p></div><a href="${sectionHref('confirmations')}">관리</a></div>`);$('mainPanel').innerHTML=`<h2>설정 · 기록</h2><p class="empty">운영 데이터 원본과 권한 경계를 유지하면서 변경·확인 기록을 관련 관리화면에서 추적합니다.</p><div class="service-list">${links.join('')||'<p class="empty">현재 역할에서 열 수 있는 기록 관리 화면이 없습니다.</p>'}</div>`;state('기록 관리')}
  async function amazonAdmin(){
    const renderRequestId=mallSourcingRequestId;
    state('Amazon 무료우선 정책 확인 중');
    try{
      const token=await accessToken();
      if(renderRequestId!==mallSourcingRequestId)return false;
      const headers=token?{authorization:`Bearer ${token}`}:{};
      const r=await fetch('/ekodimall/api/amazon/status',{headers,cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(renderRequestId!==mallSourcingRequestId)return false;
      if(!r.ok)throw new Error(d.error||`amazon_${r.status}`);
      const seller=d.sellerCentral||{},aws=d.aws||{},pay=d.amazonPay||{},connection=d.connection||{},cost=d.cost||{},policy=cost.policy||{},usage=Array.isArray(cost.usage)?cost.usage:[];
      const money=v=>Number(v||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
      const usageRows=usage.length?usage.map(row=>`<tr><td>${ae(row.serviceKey||'-')}</td><td>${ae(row.usageValue??'-')} ${ae(row.usageUnit||'')}</td><td>${row.freeRemainingPercent==null?'-':ae(row.freeRemainingPercent)+'%'}</td><td>${money(row.estimatedCostUsd)}</td></tr>`).join(''):'<tr><td colspan="4">아직 수집된 사용량이 없습니다. 비용 수집기가 연결되면 여기에 표시됩니다.</td></tr>';
      $('summaryCards').innerHTML=[
        card('아마존 판매계정',connection.configured?'등록됨':'설정 필요',connection.lastVerifiedAt?'최근 연결 테스트 기록 있음':'Seller Central · SP-API'),
        card('판매 마켓',connection.marketplaceId?'설정됨':'미설정',connection.marketplaceId||'연결 테스트로 확인'),
        card('조회 동기화',connection.configured?'준비':'연결 필요','상품 · 재고 · 주문 / 읽기 전용'),
        card('월 비용 통제',policy.freeFirstEnabled?'무료우선 ON':'정책 확인',`예산 $${money(policy.monthlyBudgetUsd)} · 예상 ${usage.length?'$'+money(cost.estimatedMonthUsd):'집계 대기'}`)
      ].join('');
      $('mainPanel').innerHTML=`<section class="amazon-workbench">
        <header class="amazon-head"><div><p class="amazon-eyebrow">판매채널 / 아마존</p><h2>아마존 판매채널</h2><p class="empty">판매계정 연결과 상품·재고·주문 조회를 통합 관리합니다.</p></div><span class="tag ${connection.lastVerifiedAt?'live':''}">${connection.lastVerifiedAt?'연결 테스트 기록 있음':connection.configured?'계정 등록됨':'설정 필요'}</span></header>
        <div class="amazon-step-grid"><div><b>1</b><span>판매자 인증</span><strong>${connection.configured?'등록됨':'설정 필요'}</strong></div><div><b>2</b><span>마켓 확인</span><strong>${connection.lastVerifiedAt?'테스트 이력 있음':'검증 필요'}</strong></div><div><b>3</b><span>데이터 조회</span><strong>읽기 전용</strong></div></div>
        <div class="actions">
          <a class="button primary" href="/ekodimall/admin/products">상품 관리</a>
          <a class="button" href="/ekodimall/admin/analytics">주문·매출</a>
          <a class="button" href="/ekodimall/admin/sourcing">판매채널 · 공급망</a>
        </div>
        <details class="amazon-detail" id="amazonAccountSettings" ${connection.configured?'':'open'}><summary><strong>판매계정 등록 · 수정</strong><span>Seller Central · SP-API 보안 인증정보</span></summary><div class="amazon-detail-body"><h3>Seller Central · SP-API 계정 연결</h3>
          <p class="empty">Amazon 앱의 LWA 자격정보를 암호화 Vault에 저장합니다. 저장된 Client Secret·Refresh Token은 다시 화면에 표시하지 않습니다.</p>
          <form id="amazonConnectionForm">
            <div class="amazon-credential-grid">
              <label>연결 이름<input name="displayName" maxlength="160" value="${ae(connection.displayName||'EKODI Mall Amazon')}"></label>
              <label>Seller ID<input name="sellerId" maxlength="120" value="${ae(connection.sellerId||'')}"></label>
              <label>Marketplace ID<input name="marketplaceId" maxlength="120" value="${ae(connection.marketplaceId||'')}" placeholder="연결 테스트 후 자동확인 가능"></label>
              <label>SP-API Endpoint<input name="endpoint" maxlength="300" value="${ae(connection.endpoint||'https://sellingpartnerapi-fe.amazon.com')}"></label>
              <label>LWA Client ID<input name="clientId" autocomplete="off" placeholder="${connection.configured?'등록됨 · 변경할 때만 입력':'amzn1.application-oa2-client...'}"></label>
              <label>LWA Client Secret<input name="clientSecret" type="password" autocomplete="new-password" placeholder="${connection.configured?'등록됨 · 변경할 때만 입력':'Client Secret'}"></label>
            </div>
            <label class="amazon-refresh">LWA Refresh Token<input name="refreshToken" type="password" autocomplete="new-password" placeholder="${connection.configured?'등록됨 · 변경할 때만 입력':'Atzr|...'}"></label>
            <div class="actions">
              <button class="button primary" type="submit">계정 연결 저장</button>
              <button class="button" id="amazonConnectionTest" type="button">읽기 전용 연결 테스트</button>
              <button class="button" id="amazonConnectionRemove" type="button">연결 해제</button>
              <a class="button" href="https://developer-docs.amazon.com/sp-api/docs/registering-your-application" target="_blank" rel="noopener">Amazon 앱 등록 안내</a>
            </div>
          </form>
          <p class="empty">상태: <strong>${ae(connection.status||'setup-required')}</strong> · Vault: <strong>${connection.vaultReady?'준비됨':'서버키 설정 필요'}</strong> · 마지막 확인: ${ae(connection.lastVerifiedAt||'-')}</p>
          ${(connection.marketplaces||[]).length?`<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Marketplace</th><th>국가</th><th>스토어</th><th>참여</th><th>정지</th></tr></thead><tbody>${connection.marketplaces.map(m=>`<tr><td>${ae(m.name||m.marketplaceId)}</td><td>${ae(m.countryCode||'-')}</td><td>${ae(m.storeName||'-')}</td><td>${m.participationActive?'활성':'비활성'}</td><td>${m.suspended?'예':'아니오'}</td></tr>`).join('')}</tbody></table></div>`:''}
</div></details>
        <section class="amazon-readonly" id="amazonReadonlySection"><div class="amazon-readonly-head"><h3>상품 · 재고 · 주문 조회</h3><span class="tag">읽기 전용</span></div>
          <p class="empty">Seller Central에서 상품·FBA 재고·주문을 읽어 EKODI 캐시에 반영합니다. Amazon의 상품·가격·재고·주문 상태는 변경하지 않습니다.</p>
          <div class="actions">
            <button class="button primary" id="amazonReadonlySync" type="button" ${connection.configured?'':'disabled'}>상품·재고·주문 조회</button>
          </div>
          <div id="amazonReadonlyResults" class="amazon-readonly-results" role="status" aria-live="polite">최근 동기화 정보를 불러오는 중입니다.</div>
        </section>
        <details class="amazon-detail" id="amazonCostSettings"><summary><strong>비용 · AWS · 유료서비스 관리</strong><span>무료우선 · 승인 정책 · 비용표</span></summary><div class="amazon-detail-body"><h3>비용 강제실행 규칙</h3>
          <form id="amazonCostPolicyForm">
            <div class="grid two">
              <label>월 최대 유료예산(USD)<input name="monthlyBudgetUsd" type="number" min="0" step="0.01" value="${ae(policy.monthlyBudgetUsd??0)}"></label>
              <label>자동중지 기준(%)<input name="autoStopPercent" type="number" min="1" max="100" value="${ae(policy.autoStopPercent??90)}"></label>
            </div>
            <div class="grid two">
              <label><input name="freeFirstEnabled" type="checkbox" ${policy.freeFirstEnabled!==false?'checked':''}> 무료우선 강제</label>
              <label><input name="paidAwsEnabled" type="checkbox" ${policy.paidAwsEnabled?'checked':''}> 유료 AWS 허용</label>
              <label><input name="sellerPaidPlanEnabled" type="checkbox" ${policy.sellerPaidPlanEnabled?'checked':''}> Seller 유료플랜 허용</label>
              <label><input name="fbaEnabled" type="checkbox" ${policy.fbaEnabled?'checked':''}> FBA 허용</label>
              <label><input name="bedrockPaidEnabled" type="checkbox" ${policy.bedrockPaidEnabled?'checked':''}> Bedrock 유료사용 허용</label>
            </div>
            <div class="actions"><button class="button primary" type="submit">비용정책 저장</button></div>
          </form>
          <p class="empty">유료 기능 스위치를 켜더라도 기능별 승인 레코드와 금액 한도가 없으면 실제 유료 실행은 계속 차단됩니다.</p>
          <form id="amazonApprovalForm" style="margin-top:14px">
            <h3>유료기능 승인</h3>
            <div class="grid two">
              <label>기능<select name="featureKey"><option value="aws-generic">일반 AWS</option><option value="seller-paid-plan">Seller 유료플랜</option><option value="fba">FBA</option><option value="bedrock-paid">Bedrock 유료</option><option value="seller-sync">Amazon 동기화</option></select></label>
              <label>승인 한도(USD)<input name="amountLimitUsd" type="number" min="0" step="0.01" value="0"></label>
            </div>
            <label>승인 사유<input name="reason" maxlength="500" placeholder="필요성과 한도 근거"></label>
            <div class="actions"><button class="button" type="submit">이 기능 승인</button></div>
          </form>
        </div>
        <div class="panel" style="margin-top:14px">
          <h3>서비스별 사용량 · 무료잔여 · 예상비용</h3>
          <div class="table-wrap"><table><thead><tr><th>서비스</th><th>사용량</th><th>무료잔여</th><th>예상비용</th></tr></thead><tbody>${usageRows}</tbody></table></div>
          <p class="empty">${(cost.warnings||[]).length?'주의: '+(cost.warnings||[]).map(ae).join(' · '):'현재 비용경고 없음'}</p>
        </div></details>
        <details class="amazon-detail" id="amazonOptionalServices"><summary><strong>기타 연동 상태</strong><span>AWS · Amazon Pay · 지원 범위</span></summary><div class="amazon-detail-body"><h3>연결 준비 상태</h3>
          <p>Seller Central: <strong>${seller.configured?'설정 완료':'자격정보 등록 필요'}</strong></p>
          <p>AWS: <strong>${aws.configured?'보조 인프라 연결':'선택 연결'}</strong> · Amazon Pay: <strong>${pay.configured?'연결됨':'선택 연결'}</strong></p>
          <p>지원 범위: ${(seller.resources||[]).map(ae).join(' · ')||'catalog · listings · pricing · inventory · orders · fulfillment · reports'}</p>
        </div></details></section>`;
      const connectionForm=$('amazonConnectionForm');
      connectionForm?.addEventListener('submit',async event=>{
        event.preventDefault();
        const fd=new FormData(connectionForm);
        const body={
          displayName:String(fd.get('displayName')||''),
          sellerId:String(fd.get('sellerId')||''),
          marketplaceId:String(fd.get('marketplaceId')||''),
          endpoint:String(fd.get('endpoint')||''),
          clientId:String(fd.get('clientId')||''),
          clientSecret:String(fd.get('clientSecret')||''),
          refreshToken:String(fd.get('refreshToken')||'')
        };
        for(const key of ['clientId','clientSecret','refreshToken'])if(!body[key])delete body[key];
        state('Amazon 계정 연결 저장 중');
        const save=await fetch('/ekodimall/api/amazon/connection',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)});
        const out=await save.json().catch(()=>({}));
        if(!save.ok){state('계정 연결 저장 실패');$('pageCopy').textContent=out.message||out.error||'Amazon 계정 연결을 저장하지 못했습니다.';return}
        state('Amazon 계정 연결 저장 완료');
        affiliateSourcingPanel('amazon');
      });
      $('amazonConnectionTest')?.addEventListener('click',async()=>{
        state('Amazon 읽기 전용 연결 테스트 중');
        const test=await fetch('/ekodimall/api/amazon/connection/test',{method:'POST',headers});
        const out=await test.json().catch(()=>({}));
        if(!test.ok){state('Amazon 연결 확인 실패');$('pageCopy').textContent=out.code||out.error||'Amazon 연결을 확인하지 못했습니다.';return}
        state('Amazon 연결 확인 완료');
        affiliateSourcingPanel('amazon');
      });
      $('amazonConnectionRemove')?.addEventListener('click',async()=>{
        if(!confirm('Amazon Seller Central 연결을 해제할까요? 저장된 암호화 자격정보와 Marketplace 캐시가 삭제됩니다.'))return;
        state('Amazon 연결 해제 중');
        const remove=await fetch('/ekodimall/api/amazon/connection',{method:'DELETE',headers});
        const out=await remove.json().catch(()=>({}));
        if(!remove.ok){state('Amazon 연결 해제 실패');$('pageCopy').textContent=out.error||'연결을 해제하지 못했습니다.';return}
        state('Amazon 연결 해제 완료');
        affiliateSourcingPanel('amazon');
      });
      const renderReadonlySnapshot=s=>{
        const el=$('amazonReadonlyResults'); if(!el)return;
        const listings=Array.isArray(s?.listings)?s.listings:[], inventory=Array.isArray(s?.inventory)?s.inventory:[], orders=Array.isArray(s?.orders)?s.orders:[], runs=Array.isArray(s?.runs)?s.runs:[];
        const last=runs[0];
        el.innerHTML=`Marketplace: <strong>${ae(s?.marketplaceId||connection.marketplaceId||'-')}</strong> · 상품 <strong>${listings.length}</strong> · 재고 <strong>${inventory.length}</strong> · 주문 <strong>${orders.length}</strong>${last?` · 최근 실행 <strong>${ae(last.status||'-')}</strong> (${ae(last.startedAt||'-')})`:''}`;
      };
      if(connection.marketplaceId){
        fetch('/ekodimall/api/amazon/read-model?marketplaceId='+encodeURIComponent(connection.marketplaceId),{headers,cache:'no-store'})
          .then(r=>r.ok?r.json():null).then(d=>{if(d)renderReadonlySnapshot(d)}).catch(()=>{});
      }else{
        const el=$('amazonReadonlyResults'); if(el)el.textContent='Marketplace 연결 테스트 후 사용할 수 있습니다.';
      }
      $('amazonReadonlySync')?.addEventListener('click',async()=>{
        if(!connection.configured){state('Amazon 계정 연결 필요');return}
        state('Amazon 상품·재고·주문 읽기 동기화 중');
        const sync=await fetch('/ekodimall/api/amazon/sync/read-only',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({marketplaceId:connection.marketplaceId,resources:['listings','inventory','orders']})});
        const out=await sync.json().catch(()=>({}));
        if(!sync.ok&&out.status!=='partial'){state('Amazon 읽기 동기화 확인 필요');$('pageCopy').textContent=(out.errors||[]).map(x=>x.resource+': '+x.code).join(' · ')||out.error||'읽기 동기화에 실패했습니다.';return}
        renderReadonlySnapshot(out.snapshot||{});
        state(out.status==='partial'?'Amazon 일부 읽기 완료':'Amazon 읽기 동기화 완료');
      });
      const approvalForm=$('amazonApprovalForm');
      approvalForm?.addEventListener('submit',async event=>{
        event.preventDefault();
        const fd=new FormData(approvalForm);
        const body={featureKey:String(fd.get('featureKey')||''),amountLimitUsd:Number(fd.get('amountLimitUsd')||0),reason:String(fd.get('reason')||'')};
        state('Amazon 유료기능 승인 저장 중');
        const save=await fetch('/ekodimall/api/amazon/approvals',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)});
        const out=await save.json().catch(()=>({}));
        if(!save.ok){state('승인 권한 또는 설정 확인 필요');$('pageCopy').textContent=out.error||'승인을 저장하지 못했습니다.';return}
        state('Amazon 유료기능 승인 완료');
        affiliateSourcingPanel('amazon');
      });
      const form=$('amazonCostPolicyForm');
      form?.addEventListener('submit',async event=>{
        event.preventDefault();
        const fd=new FormData(form);
        const body={
          freeFirstEnabled:fd.get('freeFirstEnabled')==='on',
          monthlyBudgetUsd:Number(fd.get('monthlyBudgetUsd')||0),
          autoStopPercent:Number(fd.get('autoStopPercent')||90),
          paidAwsEnabled:fd.get('paidAwsEnabled')==='on',
          sellerPaidPlanEnabled:fd.get('sellerPaidPlanEnabled')==='on',
          fbaEnabled:fd.get('fbaEnabled')==='on',
          bedrockPaidEnabled:fd.get('bedrockPaidEnabled')==='on'
        };
        state('Amazon 비용정책 저장 중');
        const save=await fetch('/ekodimall/api/amazon/cost-policy',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)});
        const out=await save.json().catch(()=>({}));
        if(!save.ok){state('저장 권한 또는 설정 확인 필요');$('pageCopy').textContent=out.error||'비용정책을 저장하지 못했습니다.';return}
        state('Amazon 비용정책 저장 완료');
        affiliateSourcingPanel('amazon');
      });
      state((cost.warnings||[]).length?'비용 주의 필요':seller.configured?'무료우선 운영 준비':'Amazon 설정 필요');
      return true;
    }catch(e){
      if(renderRequestId!==mallSourcingRequestId)return false;
      $('summaryCards').innerHTML=[card('Amazon','확인 실패','connector status')].join('');
      $('mainPanel').innerHTML=`<h2>Amazon · AWS 무료우선 비용센터</h2><p class="empty">${ae(e.message||'상태를 확인하지 못했습니다.')}</p>`;
      state('확인 필요');
      return false;
    }
  }
  async function render(){if(section==='services')return siteServiceSettings();if(!service){if(section==='overview')return rootHome();if(isBizWorkspace&&section==='business-center')return bizCenter();if(section==='saturday')return saturdayMeeting();if(section==='activities')return activityAdmin();if(section==='status')return statusAdmin();if(section==='records')return recordsAdmin();if(section==='members')return membersAdmin();if(workspace==='cgma'&&section==='member')return cgmaMemberAdmin();if(workspace==='cgma'&&section==='festival')return cgmaFestivalAdmin();if(workspace==='cgma'&&section==='edocs')return cgmaEdocAdmin();if(workspace==='cgma'&&CGMA_EMBEDDED_PANELS[section])return cgmaEmbeddedAdmin(section);if(section==='chrome')return siteChromeAdmin();if(section==='design')return designAdmin();if(section==='languages')return languageAdmin();if(section==='mail')return mailAdmin();if(section==='confirmations')return confirmationAdmin();if(section==='finance')return financeAdmin();if(isBizWorkspace&&section==='tax')return taxAdmin();if(section==='publishing'||section==='marketing')return channel();if(section==='mall')return location.replace('/ekodimall/admin');$('summaryCards').innerHTML=[card('운영공간',workspaceLabel(),'tenant scoped'),card('메뉴',meta[section]?.[0]||section,'로컬 관리')].join('');$('mainPanel').innerHTML='<p class="empty">이 운영공간의 독립 모듈입니다.</p>';return state('운영')}if(service!=='mall'){if(section==='overview'){$('summaryCards').innerHTML=[card('운영공간',workspaceLabel(),'tenant scoped'),card('하위서비스',service,'service scoped'),card('공통엔진','Channel · OAuth · Vault','shared capability'),card('권한',workspaceRole||'-','tenant role')].join('');$('mainPanel').innerHTML=`<h2>${ae(service)} 서비스 관리</h2><p class="empty">상위 운영공간의 권한을 상속하되 채널·게시 설정은 이 서비스 문맥에서 관리합니다.</p><div class="actions"><a class="button primary" href="${adminBase}/publishing">채널·자동게시</a><a class="button" href="${adminBase}/design">사이트 스타일</a><a class="button" href="${adminBase}/languages">다국어</a></div>`;return state('운영')}if(section==='chrome')return siteChromeAdmin();if(section==='design')return designAdmin();if(section==='languages')return languageAdmin();if(section==='confirmations')return confirmationAdmin();if(section==='finance')return financeAdmin();if(section==='publishing'||section==='marketing'||section==='channels')return channel();$('summaryCards').innerHTML=[card('하위서비스',service,'service scoped'),card('운영공간',workspaceLabel(),'tenant authority')].join('');$('mainPanel').innerHTML='<p class="empty">이 하위서비스는 공통 시스템 기능을 상속합니다.</p>';return state('운영')}if(section==='chrome')return siteChromeAdmin();if(section==='design')return designAdmin();if(section==='languages')return languageAdmin();if(section==='sales')return location.replace(`${adminBase}/analytics`);if(section==='analytics')return mallAnalytics();if(section==='confirmations')return confirmationAdmin();if(section==='overview')return mallHome();if(section==='amazon')return affiliateSourcingPanel('amazon');if(section==='sourcing'||section==='growth')return growthPolicyPanel(section);if(['marketing','automation'].includes(section))return location.replace(`${adminBase}/channel-settings`);if(section==='channels'||section==='publishing')return channel();if(section==='products')return mallProducts();$('summaryCards').innerHTML=[card('상품 서비스','에코디몰','EKODIBIZ 소유 운영'),card('공개주소','/ekodimall','ekodi.kr')].join('');$('mainPanel').innerHTML='<h2>상품 관리</h2><p class="empty">상품 원본은 에코디몰 독립 상품 모듈에서 관리합니다.</p>';state('운영')}
  $('workspaceLogout')?.addEventListener('click',()=>{suppressWorkspaceSsoRecovery();clearSession();location.assign(adminBase)});
  async function boot(){setup();acceptPlatformAdminHandoff();try{await exchangeCentralToken()}catch{clearSession();return loginPanel('통합인증 연결에 실패했습니다. 다시 로그인해 주세요.')}if(!(await accessToken())){if(platformAdminToken()){markPlatformAdminIntent();platformAdminSessionToken=''}if(beginWorkspaceSsoRecovery())return;if(section==='channels'||section==='publishing'||section==='marketing')return channelPreAuth();return loginPanel(hasPlatformAdminIntent()?'1단계 운영공간 로그인 후 플랫폼 관리자 인증으로 자동 이어집니다.':'중앙 EKODI 로그인 상태가 없거나 만료되었습니다. 관리자 로그인을 진행해 주세요.')}state('권한 확인 중');let context;try{context=await loadWorkspaceContext()}catch(e){if(e.status===401){clearSession();return loginPanel()}$('summaryCards').innerHTML=[card('운영공간',workspaceLabel(),'권한 확인 필요')].join('');$('mainPanel').innerHTML=`<h2>권한 확인 실패</h2><p class="empty">${e.message}</p>`;return state('확인 필요')}if(!context)return deniedPanel();applyWorkspaceContext(context);if(canSection('services')){await loadSiteServices();renderNav(workspaceRole)}if(!roleCapabilities(workspaceRole).length)return deniedPanel();const missionReturn=consumeMissionReturn();if(missionReturn){location.replace(missionReturn);return}if(!canSection(section))return permissionPanel();if(service==='mall'&&section==='sourcing'&&hasPlatformAdminIntent()&&!platformAdminToken()){clearPlatformAdminIntent();state('플랫폼 관리자 인증으로 연결 중');location.assign(platformAdminAuthUrl());return}return render()}

  boot().catch(error=>{
    const message=String(error?.message||error||'관리자 화면 초기화에 실패했습니다.');
    try{$('summaryCards').innerHTML=[card('관리자 화면','초기화 실패','자동 복구 가능'),card('운영공간',workspaceLabel(),'tenant scoped')].join('')}catch{}
    try{$('mainPanel').innerHTML=`<h2>관리자 화면을 불러오지 못했습니다</h2><p class="empty">${ae(message)}</p><div class="actions"><button class="button primary" id="workspaceBootRetry" type="button">다시 시도</button><a class="button" href="${ae(workspaceAuthUrl())}">관리자 재인증</a><a class="button" href="${ae(workspacePublicUrl())}" target="_blank" rel="noopener">사용자 화면</a></div><p class="empty">새로고침 없이 다시 시도할 수 있으며, 반복 실패 시 관리자 재인증으로 복구합니다.</p>`;state('초기화 확인 필요');$('workspaceBootRetry')?.addEventListener('click',()=>location.reload(),{once:true})}catch{}
  });
}



function workspaceAdminCompact() {
  return mountTenantAdminMetricsTabs();
}

const MALL_SOURCING_TABS_CSS=`
.mall-sourcing-head{display:block;margin:0 0 10px}
.mall-sourcing-heading{min-width:0}
.mall-sourcing-heading h2{font-size:18px;margin:0 0 4px}
.mall-sourcing-heading p{font-size:12px;margin:0}
.mall-sourcing-level{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:6px;padding:10px;border:1px solid #e1e7ef;border-radius:10px;background:#f9fbff;margin:0 0 10px;max-width:100%;min-width:0}
.mall-sourcing-primary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.mall-sourcing-tabs,.mall-sourcing-detail-tabs{display:flex;flex-wrap:wrap;align-content:flex-start;max-width:100%;justify-content:flex-start}
.mall-sourcing-detail-tabs{background:#fff}
.mall-source-tab{appearance:none;border:1px solid #d6dfeb;background:#fff;color:#1f3146;padding:8px 11px;border-radius:8px;white-space:normal;overflow-wrap:anywhere;text-align:center;line-height:1.35;min-height:36px;cursor:pointer;font:inherit;font-size:12px}
.mall-source-level-one{font-weight:600}
.mall-source-level-three{font-weight:500}
.mall-source-tab:hover,.mall-source-tab:focus-visible{border-color:#3565c2;outline-offset:2px}
.mall-source-tab.is-active{background:#173b7a;color:#fff;border-color:#173b7a;font-weight:700}
.mall-source-tab-live:not(.is-active){border-color:#9ccfb1}
.mall-source-tab-pending:not(.is-active){border-style:dashed}
.mall-source-detail{border-top:1px solid #e3e8f0;padding-top:12px;min-width:0}
.mall-source-detail h3{margin:0 0 10px}
.mall-source-detail .service-list{margin-bottom:12px}
.mall-source-policy{margin-top:12px}
.mall-source-advanced{margin:12px 0;border:1px solid #e3e8f0;border-radius:8px;padding:10px}
.mall-source-advanced summary{cursor:pointer;font-weight:600}
.amazon-workbench>[hidden]{display:none!important}
@media(max-width:1100px){.mall-sourcing-primary{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:650px){.mall-sourcing-primary{grid-template-columns:repeat(2,minmax(0,1fr))}.mall-sourcing-level{gap:5px;padding:7px}.mall-source-tab{font-size:12px;min-height:38px;padding:7px 9px}.mall-sourcing-tabs .mall-source-tab{flex:0 1 auto}}
@media(max-width:400px){.mall-sourcing-primary{grid-template-columns:repeat(2,minmax(0,1fr))}.mall-sourcing-detail-tabs .mall-source-tab{flex:1 1 calc(50% - 5px)}}
`;
const MALL_SOCIAL_CSS=`.mall-social-start{grid-template-columns:max-content minmax(140px,1fr) max-content max-content}@media(max-width:700px){.mall-social-start{grid-template-columns:1fr}}.mall-social-provider.youtube-pending .mall-social-provider-actions{display:none}.mall-simple-grid{grid-template-columns:minmax(0,1fr)!important}.mall-simple-grid .channel-main-column{min-width:0}.mall-social-open-policy>summary{cursor:pointer;font-weight:700}.mall-social-test>summary{cursor:pointer;font-weight:700;padding:8px}.mall-social-start .button{white-space:nowrap}.mall-social-setup{display:grid;gap:12px;padding:16px;border:1px solid #d5dbe3;border-radius:12px;background:#fff;color:#171717}.mall-social-heading{display:flex;align-items:start;justify-content:space-between;gap:12px}.mall-social-heading h2{font-size:18px;margin:0 0 4px;color:#111}.mall-social-heading p{font-size:12px;color:#555;margin:0}.mall-social-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.mall-social-steps span{display:flex;gap:7px;align-items:center;background:#f6f6f6;border:1px solid #e5e5e5;border-radius:7px;font-size:12px;padding:9px}.mall-social-steps b{background:#222;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;flex:0 0 22px}.mall-social-providers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mall-social-provider{min-width:0;display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #e2e2e2;border-radius:9px;background:#fff}.mall-social-provider-head{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap}.mall-social-provider-head strong{font-size:14px}.mall-social-pill{font-size:11px;color:#555;padding:4px 7px;background:#f3f3f3;border:1px solid #ddd;border-radius:20px;white-space:nowrap}.mall-social-pill.ready{color:#11452a;background:#eaf6ee;border-color:#bbdfc6}.mall-social-provider p{font-size:11px;margin:0;color:#555;line-height:1.45;min-height:33px}.mall-social-provider-meta{font-size:11px;font-weight:600;color:#333}.mall-social-provider-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.mall-social-provider-actions .button{font-size:11px;padding:7px 8px}.mall-social-provider-actions button:disabled{opacity:.55;cursor:not-allowed}.mall-social-blocker{display:block;color:#865019;font-size:10px;line-height:1.45}.mall-social-summary{display:flex;flex-wrap:wrap;gap:12px;border-top:1px solid #eaeaea;padding-top:11px;font-size:12px}.mall-social-summary b{font-weight:700;margin-right:4px}.mall-social-security{margin:0;font-size:11px;color:#666;line-height:1.5}.mall-social-test{border:1px solid #ddd;border-radius:10px;padding:14px;background:#fff}.mall-social-test h2{font-size:15px;margin:0 0 5px}.mall-social-test p{font-size:12px;color:#555;margin:0 0 10px}.mall-social-test form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mall-social-test label{display:grid;gap:5px;font-size:12px;font-weight:600}.mall-social-test label.wide{grid-column:1/-1}.mall-social-test input,.mall-social-test select,.mall-social-test textarea{min-width:0;width:100%;font:inherit;font-size:13px;padding:9px;border:1px solid #ccc;border-radius:7px;background:#fff;color:#111}.mall-social-test textarea{resize:vertical;min-height:72px}.mall-social-test button{justify-self:start}.mall-social-test-output{grid-column:1/-1;font-size:12px;min-height:18px}.mall-social-blocked{padding:10px;border:1px dashed #ddd;border-radius:8px;font-size:12px;color:#555}.mall-social-open-policy{background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px}.mall-social-open-policy>.trade-form{margin:0;padding:0;border:0}.mall-social-next{padding:9px 11px;background:#f9f8f4;border:1px solid #dfd7c9;border-radius:8px;font-size:12px;color:#64421f;line-height:1.5}.mall-social-next.ready{color:#165537;background:#f2fbf5;border-color:#bedccb}.mall-social-next strong{margin-right:7px}.mall-social-start{display:grid;grid-template-columns:max-content minmax(190px,1fr) max-content;align-items:center;gap:9px;border:1px solid #e2e2e2;border-radius:9px;background:#fff;padding:10px}.mall-social-start label{font-size:12px;font-weight:700}.mall-social-start input{min-height:38px;width:100%;padding:8px;border:1px solid #bbb;border-radius:6px;color:#111;font-size:13px}.mall-social-start small{grid-column:1/-1;font-size:11px;color:#666}.mall-social-start #mallSocialYoutubeMessage{grid-column:1/-1;font-size:12px;color:#2a456b}.mall-social-start .button{font-size:12px;padding:8px 12px}@media(max-width:700px){.mall-social-start{grid-template-columns:1fr}.mall-social-start small,.mall-social-start #mallSocialYoutubeMessage{grid-column:1}}@media(max-width:1200px){.mall-social-providers{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.mall-social-setup{padding:12px;gap:10px}.mall-social-heading h2{font-size:16px}.mall-social-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.mall-social-providers{grid-template-columns:1fr}.mall-social-provider p{min-height:0}.mall-social-test form{grid-template-columns:1fr}.mall-social-heading{flex-wrap:wrap}.mall-social-summary{gap:8px}.mall-social-test{padding:12px}}`;
const MALL_CHANNEL_CSS=`.panel.channel-shell-panel{padding:0;border:0;background:transparent}.channel-workbench{display:grid;gap:14px}.channel-quickbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #d9e5f6;border-radius:12px;background:#f3f7ff}.channel-quick-copy{display:flex;align-items:center;gap:11px;min-width:0}.channel-quick-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:10px;background:#e3ecff;color:#1f57b7;font-size:18px;font-weight:900}.channel-quick-copy strong{display:block;font-size:14px;color:#172033}.channel-quick-copy p{margin:3px 0 0;color:#667085;font-size:12px;line-height:1.55}.channel-quick-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.channel-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px;align-items:start}.channel-main-column{display:grid;gap:12px;min-width:0}.channel-primary-card,.channel-detail-section,.channel-help{background:#fff;border:1px solid #e6eaf1;border-radius:12px}.channel-primary-card,.channel-detail-section{padding:14px}.channel-primary-card h2,.channel-detail-section h2,.channel-help h2{margin:0 0 5px;font-size:16px}.channel-primary-card>p,.channel-detail-section>p{margin:0 0 12px;color:#6b7280;font-size:12px}.channel-table-wrap{overflow:auto;border:1px solid #edf0f5;border-radius:10px}.channel-table{width:100%;border-collapse:collapse;min-width:720px}.channel-table th{padding:9px 10px;background:#fafbfc;color:#667085;font-size:11px;font-weight:800}.channel-table td{padding:10px;border-top:1px solid #edf0f5;font-size:12px;vertical-align:middle}.channel-platform{display:flex;align-items:center;gap:9px;min-width:150px}.channel-platform-mark{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:9px;background:#eef3ff;color:#1f3c88;font-size:10px;font-weight:900}.channel-platform strong{display:block;font-size:13px}.channel-platform small{display:block;margin-top:2px;color:#8a94a6;font-size:10px}.channel-auto-state{display:inline-flex;align-items:center;gap:6px;color:#596579}.channel-auto-dot{width:8px;height:8px;border-radius:999px;background:#cbd5e1}.channel-auto-state.on{color:#287347}.channel-auto-state.on .channel-auto-dot{background:#2f9e5b}.channel-action{display:flex;justify-content:flex-end;gap:6px}.channel-action .button{margin:0}.channel-detail-section{scroll-margin-top:18px}.channel-detail-section>summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:800;color:#263244}.channel-detail-section>summary::-webkit-details-marker{display:none}.channel-detail-section>summary::after{content:'펼치기';font-size:11px;font-weight:700;color:#667085}.channel-detail-section[open]>summary::after{content:'접기'}.channel-detail-section[open]>summary{padding-bottom:12px;border-bottom:1px solid #edf0f5;margin-bottom:12px}.channel-help{position:sticky;top:16px;padding:14px}.channel-help-step{display:grid;grid-template-columns:28px 1fr;gap:9px;padding:10px 0;border-top:1px solid #edf0f5}.channel-help-step:first-of-type{border-top:0}.channel-help-step b{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#eaf1ff;color:#1f57b7;font-size:11px}.channel-help-step strong{display:block;font-size:12px}.channel-help-step p{margin:3px 0 0;color:#7d8796;font-size:11px;line-height:1.55}.channel-help-links{display:grid;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #edf0f5}.channel-help-links button{width:100%;text-align:left}.channel-account-list{display:grid;gap:8px;margin-top:12px}.channel-empty{padding:12px;border:1px dashed #dce3ee;border-radius:9px;background:#fafbfc;color:#7d8796;font-size:12px}@media(max-width:980px){.channel-main-grid{grid-template-columns:1fr}.channel-help{position:static}.channel-quickbar{align-items:flex-start;flex-direction:column}.channel-quick-actions{justify-content:flex-start;width:100%}}@media(max-width:620px){.channel-quick-actions{display:grid;grid-template-columns:1fr;width:100%}.channel-quick-actions .button{justify-content:center;min-height:42px}.channel-primary-card,.channel-detail-section,.channel-help{padding:12px}.channel-table{min-width:660px}}`;

export function workspaceAdminPage(){return new Response(`<!doctype html><html lang="ko" data-ekodi-workspace-admin-runtime="20261002-common-engine-ui-v1" data-ekodi-admin-common-engine="workspace" data-ekodi-admin-menu-model="single-task-menu" data-ekodi-authority-scope="tenant" data-ekodi-admin-layout="direct-left" data-ekodi-admin-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>EKODI Workspace Admin</title><link rel="stylesheet" href="/workspace-admin.css?v=20261009-common-engine-ui-v1"></head><body><header class="topbar" data-ekodi-admin-topbar><a class="brand" href="/">EKODI</a><div class="context"><strong id="workspaceName">운영공간</strong><span id="serviceName">관리</span></div></header><div class="layout"><aside class="sidebar" data-ekodi-admin-sidebar><div id="adminScopeSwitcher" class="admin-scope-switcher" data-ekodibiz-site-switch aria-label="관리 사이트 전환" hidden></div><div class="scope"><span>고객 운영공간</span><strong id="scopeLabel">운영공간 확인 중</strong></div><nav id="adminNav" data-ekodi-admin-nav data-ekodi-admin-nav-mode="direct"></nav><p class="boundary">플랫폼 공통 관리는 <a href="https://ekodi.kr/admin/">ekodi.kr/admin</a>에서 수행합니다.</p><div class="sidebar-footer" data-ekodi-admin-sidebar-footer><a class="public-link" id="publicLink" href="/">사용자 화면</a><button id="workspaceLogout" data-ekodi-logout type="button">로그아웃</button></div></aside><main data-ekodi-admin-main><nav id="sectionNav" class="admin-subnav" data-ekodi-admin-subnav aria-label="세부 메뉴" hidden></nav><section class="heading"><div><p class="eyebrow" id="breadcrumb">WORKSPACE ADMIN</p><h1 id="pageTitle">대시보드</h1><p id="pageCopy">이 운영공간에 속한 서비스와 데이터를 관리합니다.</p></div><span class="state" id="pageState">확인 중</span></section><nav class="admin-view-tabs" aria-label="관리자 화면 보기" role="tablist" data-ekodi-admin-view-tabs><button type="button" role="tab" id="adminWorkTab" aria-controls="mainPanel" aria-selected="true" data-admin-view="work">업무</button><button type="button" role="tab" id="adminMetricsTab" aria-controls="summaryCards" aria-selected="false" data-admin-view="metrics">운영 지표</button></nav><section class="cards" id="summaryCards" role="tabpanel" aria-labelledby="adminMetricsTab" hidden></section><section class="panel" id="mainPanel" role="tabpanel" aria-labelledby="adminWorkTab"><div class="loading-shell" aria-live="polite"><p class="loading">관리자 인증과 운영공간 권한을 확인하고 있습니다.</p><div class="loading-bar mid"></div><div class="loading-bar"></div><div class="loading-bar short"></div></div></section></main></div><script src="/workspace-admin.js?v=20261002-common-engine-ui-v1" defer></script><script src="/workspace-trade-admin.js?v=20260909-admin-ui-v8" defer></script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'x-ekodi-route':'workspace-admin','x-ekodi-authority-scope':'tenant'}})}

const AMAZON_ADMIN_CSS=`.admin-nav-nested{padding-left:18px!important;margin-left:10px!important;width:calc(100% - 10px)!important;border-left:2px solid #cad5e5!important;font-size:11.5px!important;border-radius:0 7px 7px 0!important}.amazon-workbench{display:grid;gap:12px;min-width:0}.amazon-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.amazon-head h2{font-size:21px;margin:0 0 5px}.amazon-head .empty{margin:0}.amazon-eyebrow{color:#64748b;font-size:11px;font-weight:800;margin:0 0 4px}.amazon-head>.tag{white-space:nowrap}.amazon-step-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.amazon-step-grid>div{display:grid;grid-template-columns:28px 1fr;gap:2px 8px;align-items:center;border:1px solid #e1e7ef;background:#f8fafc;border-radius:9px;padding:11px}.amazon-step-grid b{grid-row:span 2;display:grid;place-items:center;background:#e2e8f0;border-radius:50%;width:26px;height:26px;font-size:11px}.amazon-step-grid span{font-size:11px;color:#64748b}.amazon-step-grid strong{font-size:12px}.amazon-detail{border:1px solid #e1e7ef;border-radius:11px;background:#fff;overflow:hidden}.amazon-detail>summary{padding:13px 15px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px}.amazon-detail>summary::-webkit-details-marker{display:none}.amazon-detail>summary strong{font-size:13px}.amazon-detail>summary span{font-size:11px;color:#64748b}.amazon-detail[open]>summary{border-bottom:1px solid #e1e7ef}.amazon-detail-body{padding:14px}.amazon-detail-body h3{font-size:15px;margin:0 0 9px}.amazon-credential-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.amazon-credential-grid label,.amazon-refresh{display:grid;gap:5px;font-size:12px;color:#475569;min-width:0}.amazon-credential-grid input,.amazon-refresh input{min-width:0;width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font:inherit;font-size:12px}.amazon-refresh{margin-top:10px}.amazon-readonly{border:1px solid #dbe3ee;background:#fff;border-radius:11px;padding:14px}.amazon-readonly-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.amazon-readonly-head h3{font-size:15px;margin:0}.amazon-readonly-results{font-size:12px;background:#f8fafc;padding:10px;border-radius:8px;line-height:1.5}.amazon-workbench button:disabled{cursor:not-allowed;opacity:.5}@media(max-width:860px){.amazon-step-grid{grid-template-columns:1fr}}@media(max-width:620px){.amazon-head{flex-direction:column}.amazon-credential-grid{grid-template-columns:1fr}.amazon-detail>summary{flex-direction:column;align-items:flex-start}.amazon-detail-body{padding:10px}}`;

const MALL_SOCIAL_LAYOUT_CSS=`
/* Site switch is always the first action on the left of the current workspace. */
.admin-scope-switcher{justify-content:flex-start;margin:-2px 0 10px;gap:10px}
.admin-scope-switcher .admin-scope-label{margin-right:0!important;font-size:12px;color:#475569}
.admin-scope-switcher .admin-scope-select{width:auto;min-width:210px;max-width:min(340px,70vw)}
/* Compact overview, then actionable steps, then provider management. */
.mall-social-setup{gap:10px;padding:14px}
.mall-social-heading{align-items:center}
.mall-social-heading h2{font-size:19px}
.mall-social-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;border-top:0;padding-top:0}
.mall-social-summary span{min-width:0;padding:8px 10px;background:#f8fafc;border:1px solid #e3e9f0;border-radius:8px;font-size:12px;line-height:1.35}
.mall-social-summary b{display:block;margin:0 0 3px;color:#64748b;font-size:11px}
.mall-social-steps{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.mall-social-steps button{display:flex;align-items:center;gap:8px;min-width:0;min-height:40px;padding:8px 10px;border:1px solid #dbe3ee;border-radius:8px;background:#fff;color:#273449;font:inherit;font-size:13px;font-weight:700;text-align:left;cursor:pointer}
.mall-social-steps button:hover{border-color:#9db5db;background:#f4f7fc}
.mall-social-steps button:focus-visible{outline:2px solid #315d9a;outline-offset:2px}
.mall-social-steps button b{display:grid;place-items:center;width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:#315d9a;color:#fff;font-size:12px}
.mall-social-providers{scroll-margin-top:14px}
.mall-social-provider{gap:6px;padding:12px}
.mall-social-provider p{min-height:0;font-size:12px;line-height:1.45}
.mall-social-provider-meta{font-size:12px}
.mall-social-provider-actions .button{font-size:12px}
.mall-social-security{font-size:12px}
.channel-workbench{gap:10px}
@media(max-width:1100px){.mall-social-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:700px){.admin-scope-switcher{justify-content:flex-start;margin:0 -12px 10px;padding:8px 12px}.admin-scope-switcher .admin-scope-select{min-width:0;max-width:65vw}.mall-social-heading{align-items:flex-start}.mall-social-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.mall-social-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.mall-social-steps button{min-height:44px}.mall-social-setup{padding:12px}}
@media(max-width:390px){.admin-scope-switcher{flex-wrap:wrap}.admin-scope-switcher .admin-scope-select{max-width:100%;flex:1 1 190px}.mall-social-summary{grid-template-columns:1fr 1fr}}
`;
const WORKSPACE_ADMIN_VIEW_CSS = `
/* Shared tenant-admin structure: concise heading, actionable tab, optional metrics. */
.layout main > .heading{display:flex!important;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 10px;padding:0;background:transparent;min-width:0}
.layout main > .heading h1{font-size:clamp(20px,2vw,25px);line-height:1.35;margin:0 0 3px;word-break:keep-all;overflow-wrap:normal}
.layout main > .heading .eyebrow{font-size:11px;margin:0 0 3px}
.layout main > .heading p:not(.eyebrow){font-size:13px;line-height:1.5;margin:0;color:#64748b;word-break:keep-all}
.layout main > .heading .state{display:none!important}
.admin-view-tabs{display:flex;align-items:center;gap:6px;min-width:0;min-height:42px;padding:0 0 8px;margin:0 0 10px;border-bottom:1px solid #dfe5ec;overflow-x:auto;scrollbar-width:thin}
.admin-view-tabs button{flex:0 0 auto;min-height:38px;padding:7px 15px;border:1px solid #d6e0ea;border-radius:9px;background:#fff;color:#475569;font:inherit;font-size:13px;font-weight:700;cursor:pointer;word-break:keep-all}
.admin-view-tabs button:hover{background:#f1f6ff;border-color:#a5bee0}
.admin-view-tabs button.active{border-color:#9bbce5;background:#eaf3ff;color:#0b4fb3;font-weight:850}
.admin-view-tabs button:focus-visible{outline:2px solid #155eef;outline-offset:2px}
.layout main > .cards[hidden],.layout main > .panel[hidden]{display:none!important}
.layout main > #summaryCards{grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:10px;min-width:0}
.layout main > #summaryCards .card{padding:12px;box-shadow:none}
.layout main > #summaryCards .card small{font-size:11px;line-height:1.45;word-break:keep-all}
@media(max-width:700px){.layout main > .heading{margin:0 0 8px}.layout main > .heading h1{font-size:20px}.admin-view-tabs{flex-wrap:nowrap}.admin-view-tabs button{min-height:44px;padding:9px 12px}.layout main > #summaryCards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:360px){.layout main > #summaryCards{grid-template-columns:1fr}}
`;

export function workspaceAdminCss(){return new Response(CHURCH_ADMIN_NAV_CSS+TENANT_SERVICE_CSS+TENANT_AUTOMATION_CSS+CSS+MALL_DASH_CSS+MALL_SOURCING_TABS_CSS+MALL_SOCIAL_CSS+MALL_CHANNEL_CSS+AMAZON_ADMIN_CSS+MALL_SOCIAL_LAYOUT_CSS+WORKSPACE_ADMIN_VIEW_CSS+tenantAdminMetricsTabsCss+`html[data-ekodi-shell-surface="admin"] .sidebar #adminNav{align-content:start!important;grid-auto-rows:max-content!important;gap:3px!important}html[data-ekodi-shell-surface="admin"] .sidebar #adminNav .admin-nav-accordion{align-content:start!important;grid-template-rows:max-content max-content!important}html[data-ekodi-shell-surface="admin"] .sidebar #adminNav .admin-nav-accordion-toggle{min-height:36px!important;height:auto!important}html[data-ekodi-shell-surface="admin"] .sidebar #adminNav .admin-nav-accordion-panel{align-content:start!important;grid-auto-rows:max-content!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar{background:#fff!important;color:#172033!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar [data-ekodi-admin-nav] :is(a,button){color:#273244!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar [data-ekodi-admin-nav] :is(a,button)[aria-current="page"],html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar [data-ekodi-admin-nav] :is(a,button).active{color:#111827!important;background:#eceff3!important;font-weight:800!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar #adminNav{align-content:start!important;grid-auto-rows:max-content!important;gap:3px!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar .admin-nav-accordion{align-content:start!important;grid-template-rows:max-content max-content!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar .admin-nav-accordion-toggle{min-height:36px!important;height:auto!important}html[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar.sidebar .admin-nav-accordion-panel{align-content:start!important;grid-auto-rows:max-content!important}`+`.cards:empty{display:none!important}.confirmation-counts{font-size:13px;font-weight:500;color:#6b7280;margin-left:8px}.confirmation-new{margin-top:16px;border:1px solid #e6eaf1;border-radius:10px;padding:10px 14px;background:#fff}.confirmation-new>summary{cursor:pointer;font-weight:700;padding:4px 0}`+`:root[data-ekodi-shell-surface="admin"][data-ekodi-admin-theme="light"]{color-scheme:light!important;background:#f5f7fb!important;--ekodi-ui-bg:#f5f7fb;--ekodi-ui-surface:#fff;--ekodi-ui-surface-raised:#fff;--ekodi-ui-border:#e6eaf1;--ekodi-ui-text:#172033;--ekodi-ui-muted:#6b7280;--ekodi-ui-accent:#315d9a}:root[data-ekodi-shell-surface="admin"][data-ekodi-admin-theme="light"] body{background:#f5f7fb!important;color:#172033!important}:root[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar{top:0!important;height:100dvh!important}:root[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav[data-ekodi-admin-nav-mode="direct"]{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable!important}:root[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-sidebar:has([data-ekodi-admin-nav-mode="direct"]){overflow:hidden!important}:root[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-main{background:#f5f7fb!important;color:#172033!important}@media(max-width:860px){:root[data-ekodi-shell-surface="admin"] .ekodi-admin-shell-nav[data-ekodi-admin-nav-mode="direct"]{flex:0 0 auto!important;min-height:auto!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-gutter:auto!important}}`,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}
export function workspaceAdminScript(){const payload=tenantAdminPolicySnapshot();return new Response(`window.__EKODI_WORKSPACE_ADMIN_RUNTIME__='20261002-common-engine-ui-v1';\n((__name)=>{\nconst youtubeDataApiDisabledProject=${youtubeDataApiDisabledProject.toString()};\nconst youtubeDataApiCloudUrl=${youtubeDataApiCloudUrl.toString()};\nconst renderMallSocialSetup=${renderMallSocialSetup.toString()};
const mountTenantAdminMetricsTabs=${mountTenantAdminMetricsTabs.toString()};\nconst renderTenantServiceAdmin=${renderTenantServiceAdmin.toString()};\nconst mountTenantNotificationMetrics=${mountTenantNotificationMetrics.toString()};\nconst tenantAutomationOverviewModel=${tenantAutomationOverviewModel.toString()};\nconst tenantAutomationOverviewHtml=${tenantAutomationOverviewHtml.toString()};\nconst bindTenantAutomationOverview=${bindTenantAutomationOverview.toString()};
const confirmTenantServicePreference=${confirmTenantServicePreference.toString()};\nconst CHURCH_ADMIN_MENU=${JSON.stringify(CHURCH_ADMIN_MENU)};\nconst mountChurchAdminNavigation=${mountChurchAdminNavigation.toString()};\n(${clientMain.toString()})(${JSON.stringify(payload)},${JSON.stringify(ekodiBizAdminScopeSnapshot())},${JSON.stringify(channelTargetOptions())});
(${workspaceAdminCompact.toString()})();\n})((target)=>target);`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
export function isWorkspaceAdminPath(pathname){return isWorkspaceAdminPathShape(pathname)}
