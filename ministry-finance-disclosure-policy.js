/**
 * EKODI Ministry: approved aggregate disclosure boundary (server-side).
 * This module intentionally never reads or projects raw offerings, donations,
 * attendance, bank transactions, or the identity of any contributor.
 * The caller MUST validate the access token against Supabase Auth and resolve
 * tenant membership server-side; browser-supplied authorization is forbidden.
 */
const TENANTS=Object.freeze({
  ekodichurch:'ekodi-church',
  ekodimission:'ekodimission'
});
const SECTIONS=Object.freeze(['income','expense','balance','budget']);
const LABELS=Object.freeze({
  income:Object.freeze({offerings:'헌금',donations:'후원',grants:'지원금',other:'기타 수입'}),
  expense:Object.freeze({worship:'예배',missions:'선교',education:'교육',welfare:'구제',programs:'사업',operations:'운영',other:'기타 지출'}),
  balance:Object.freeze({opening:'기초잔액',closing:'기말잔액'}),
  budget:Object.freeze({approved:'승인예산',used:'집행액'})
});
const MINIMUM_GROUP_SIZE=3;
const deny=reason=>Object.freeze({ok:false,reason,sections:[]});
const isIsoDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'));
const validAmount=value=>Number.isSafeInteger(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);

export function canonicalMinistryTenant(value){
  return own(TENANTS,value)?TENANTS[value]:null;
}

export function selectMinistryFinanceDisclosure({
  site,
  verifiedUser,
  membership,
  publication,
  requestedSections=SECTIONS
}={}){
  const tenant=canonicalMinistryTenant(site);
  if(!tenant)return deny('unknown_tenant');
  if(!verifiedUser||typeof verifiedUser.id!=='string'||!verifiedUser.id)return deny('sign_in_required');
  // membership MUST be loaded from the authoritative server database.
  if(!membership||membership.tenantId!==tenant||membership.userId!==verifiedUser.id||
      membership.status!=='active'||membership.verified!==true)return deny('membership_required');
  if(!publication||publication.tenantId!==tenant||publication.status!=='approved'||
      publication.audience!=='members'||!publication.approvedBy||
      !isIsoDate(publication.periodStart)||!isIsoDate(publication.periodEnd)||
      publication.periodStart>publication.periodEnd)return deny('not_published');
  if(!Array.isArray(publication.blocks)||!Array.isArray(publication.allowedSections))
    return deny('invalid_publication');
  if(!Array.isArray(requestedSections)||requestedSections.some(s=>!SECTIONS.includes(s)))
    return deny('invalid_selection');
  const allowed=new Set(publication.allowedSections.filter(s=>SECTIONS.includes(s)));
  const selected=[...new Set(requestedSections)].filter(s=>allowed.has(s));
  const blocks=[];
  for(const block of publication.blocks){
    if(!block||!selected.includes(block.section)||!own(LABELS[block.section],block.category))continue;
    // Small categories can identify an individual donor, even without a name.
    // Balance & budget should also be released only when the entire report is
    // drawn from a sufficiently large verified accounting population.
    if(!Number.isSafeInteger(block.sourceCount)||block.sourceCount<MINIMUM_GROUP_SIZE||
        !validAmount(block.amount)||block.approved!==true)continue;
    if((block.section==='income')&&(!Number.isSafeInteger(block.distinctContributors)||
        block.distinctContributors<MINIMUM_GROUP_SIZE))continue;
    blocks.push(Object.freeze({
      section:block.section,
      category:block.category,
      label:LABELS[block.section][block.category],
      amount:block.amount
    }));
  }
  return Object.freeze({
    ok:true,
    tenant,
    periodStart:publication.periodStart,
    periodEnd:publication.periodEnd,
    sections:selected,
    blocks,
    // Raw memo, bank numbers, donor identities, evidence references, and
    // provider transaction IDs are NEVER projected.
    approvedAt:typeof publication.approvedAt==='string'?publication.approvedAt:null
  });
}

export const MINISTRY_DISCLOSURE_ALLOWED_SECTIONS=SECTIONS;
