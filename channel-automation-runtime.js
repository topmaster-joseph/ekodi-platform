import { CHANNEL_AUTOMATION_TEMPLATES, channelAutomationEntitlement, templateForOwner } from './channel-automation-policy.js';
const PLAN_SCORE = Object.freeze({free:0,flex:1,plus:2,pro:3,auto:4,enterprise:5});
const nowIso = () => new Date().toISOString();
function clean(value,max=240){return String(value||'').trim().slice(0,max)}
function safeJson(value,fallback={}){try{return JSON.stringify(value??fallback)}catch{return JSON.stringify(fallback)}}
function safeParse(value,fallback={}){try{return JSON.parse(value||'')}catch{return fallback}}

export async function currentAutomationPlan(env, subject) {
  if (!env.DB) return 'free';
  let rows = [];
  if (subject.type === 'store') {
    const tenant = await env.DB.prepare('SELECT tenant_slug FROM marketing_store_workspaces WHERE store_id=?').bind(subject.key).first();
    if (tenant?.tenant_slug) rows = (await env.DB.prepare("SELECT plan_id FROM service_subscriptions WHERE site='marketing' AND status='active' AND subject_type='tenant' AND subject_key=?").bind(tenant.tenant_slug).all()).results || [];
  } else {
    rows = (await env.DB.prepare("SELECT plan_id FROM service_subscriptions WHERE site='marketing' AND status='active' AND subject_type=? AND subject_key=?").bind(subject.type,subject.key).all()).results || [];
  }
  return rows.map(row=>String(row.plan_id||'free').toLowerCase()).sort((a,b)=>(PLAN_SCORE[b]??0)-(PLAN_SCORE[a]??0))[0] || 'free';
}

export async function automationEntitlement(env, subject) {
  const plan = await currentAutomationPlan(env,subject);
  const entitlement = channelAutomationEntitlement(plan);
  const ownerType = subject.ownerType || (subject.type === 'person' ? 'person' : 'workspace');
  return { ...entitlement, ownerType, ownerKey:subject.ownerKey || subject.workspaceId || subject.key, workspaceId:subject.workspaceId || '', workspaceSlug:subject.workspaceSlug || '', templates:CHANNEL_AUTOMATION_TEMPLATES.filter(item=>item.owners.includes(ownerType)) };
}
export async function listAutomationProfiles(env, subject) {
  const ownerType = subject.ownerType || (subject.type === 'person' ? 'person' : 'workspace');
  const ownerKey = subject.ownerKey || subject.workspaceId || subject.key;
  const result = await env.DB.prepare('SELECT template_id,enabled,timezone,schedule_json,policy_json,created_at,updated_at FROM channel_automation_profiles WHERE owner_type=? AND owner_key=? ORDER BY template_id').bind(ownerType,ownerKey).all();
  return (result.results || []).map(row=>({templateId:row.template_id,enabled:Boolean(row.enabled),timezone:row.timezone,schedule:safeParse(row.schedule_json,{}),policy:safeParse(row.policy_json,{}),createdAt:row.created_at,updatedAt:row.updated_at}));
}

export async function upsertAutomationProfile(env, identity, subject, body = {}) {
  const ownerType = subject.ownerType || (subject.type === 'person' ? 'person' : 'workspace');
  const ownerKey = subject.ownerKey || subject.workspaceId || subject.key;
  const templateId = clean(body.templateId,80);
  if (!templateForOwner(templateId,ownerType)) throw Object.assign(new Error('CHANNEL_TEMPLATE_NOT_ALLOWED'),{code:'CHANNEL_TEMPLATE_NOT_ALLOWED',status:400});
  const timezone = clean(body.timezone || 'Asia/Seoul',80);
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(timezone)) throw Object.assign(new Error('CHANNEL_TIMEZONE_INVALID'),{code:'CHANNEL_TIMEZONE_INVALID',status:400});
  const now=nowIso();
  await env.DB.prepare(`INSERT INTO channel_automation_profiles(owner_type,owner_key,workspace_slug,template_id,enabled,timezone,schedule_json,policy_json,created_by_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_type,owner_key,template_id) DO UPDATE SET workspace_slug=excluded.workspace_slug,enabled=excluded.enabled,timezone=excluded.timezone,schedule_json=excluded.schedule_json,policy_json=excluded.policy_json,updated_at=excluded.updated_at`).bind(ownerType,ownerKey,subject.workspaceSlug||'',templateId,body.enabled?1:0,timezone,safeJson(body.schedule||{}),safeJson(body.policy||{}),identity.email,now,now).run();
  return {ok:true,templateId,enabled:Boolean(body.enabled),timezone};
}
