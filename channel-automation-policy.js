const PLAN_ORDER = Object.freeze(['free','flex','plus','pro','auto','enterprise']);

export const CHANNEL_AUTOMATION_PLANS = Object.freeze({
  free: Object.freeze({ maxChannels:0, manualExport:true, immediate:false, scheduled:false, repeating:false, optimal:false, autonomous:false, analytics:false }),
  flex: Object.freeze({ maxChannels:1, manualExport:true, immediate:true, scheduled:false, repeating:false, optimal:false, autonomous:false, analytics:false }),
  plus: Object.freeze({ maxChannels:3, manualExport:true, immediate:true, scheduled:true, repeating:false, optimal:false, autonomous:false, analytics:false }),
  pro: Object.freeze({ maxChannels:5, manualExport:true, immediate:true, scheduled:true, repeating:true, optimal:false, autonomous:false, analytics:true }),
  auto: Object.freeze({ maxChannels:10, manualExport:true, immediate:true, scheduled:true, repeating:true, optimal:true, autonomous:true, analytics:true }),
  enterprise: Object.freeze({ maxChannels:25, manualExport:true, immediate:true, scheduled:true, repeating:true, optimal:true, autonomous:true, analytics:true }),
});

export const CHANNEL_AUTOMATION_TEMPLATES = Object.freeze([
  Object.freeze({ id:'shorts_general', label:'일반 쇼츠', contentType:'short_video', owners:['person','workspace'] }),
  Object.freeze({ id:'devotional_daily', label:'매일묵상', contentType:'short_video', owners:['workspace'], specialty:'ministry' }),
  Object.freeze({ id:'store_promo', label:'매장 홍보', contentType:'short_video', owners:['workspace'], specialty:'business' }),
  Object.freeze({ id:'event_promo', label:'행사 안내', contentType:'short_video', owners:['person','workspace'] }),
  Object.freeze({ id:'product_short', label:'상품 쇼츠', contentType:'short_video', owners:['person','workspace'], specialty:'commerce' }),
  Object.freeze({ id:'education_short', label:'교육 쇼츠', contentType:'short_video', owners:['person','workspace'], specialty:'education' }),
  Object.freeze({ id:'daily_tip', label:'오늘의 팁', contentType:'short_video', owners:['person','workspace'] }),
]);
export function normalizeAutomationPlan(value) {
  const plan = String(value || 'free').trim().toLowerCase();
  return Object.hasOwn(CHANNEL_AUTOMATION_PLANS, plan) ? plan : 'free';
}

export function channelAutomationEntitlement(planValue) {
  const plan = normalizeAutomationPlan(planValue);
  return Object.freeze({ plan, ...CHANNEL_AUTOMATION_PLANS[plan] });
}

export function planAtLeast(planValue, minimum) {
  return PLAN_ORDER.indexOf(normalizeAutomationPlan(planValue)) >= PLAN_ORDER.indexOf(normalizeAutomationPlan(minimum));
}

export function automationModeAllowed(planValue, scheduleKind, requestedBy = 'human') {
  const entitlement = channelAutomationEntitlement(planValue);
  if (requestedBy === 'ai' && !entitlement.autonomous) return false;
  if (scheduleKind === 'immediate') return entitlement.immediate;
  if (scheduleKind === 'scheduled') return entitlement.scheduled;
  if (scheduleKind === 'repeating') return entitlement.repeating;
  if (scheduleKind === 'optimal') return entitlement.optimal;
  return false;
}

export function templateForOwner(templateId, ownerType) {
  return CHANNEL_AUTOMATION_TEMPLATES.find(item => item.id === templateId && item.owners.includes(ownerType)) || null;
}