// Owner-authorized simulation preset only. Never an order instruction or live-trading approval.
// This module is side-effect free and contains no symbols, credentials, signals, or external calls.
import { normalizeAutopilotPolicy, missingPolicyFields, AUTOPILOT_HARD_LIMITS } from './invest-autopilot-core.js';

export const STAGE2_PAPER_PRESET_ID='stage2-kr-etf-conservative-paper-v1';
export const STAGE2_PAPER_PRESET=Object.freeze({
 totalBudget:1_000_000,
 maxOrderAmount:50_000,
 maxDailyBuyAmount:100_000,
 maxPositions:5,
 maxPositionWeightPct:15,
 minCashPct:30,
 dailyLossLimitPct:1,
 totalLossLimitPct:5,
 horizonYears:5,
 markets:Object.freeze(['KR']),
 assetTypes:Object.freeze(['ETF']),
 riskProfile:'conservative',
 tradingWindow:Object.freeze({start:'09:30',end:'15:00',tz:'Asia/Seoul'}),
 maxTradesPerDay:2,
 alertChannels:Object.freeze(['admin'])
});
export const STAGE2_PAPER_AUTOMATION=Object.freeze({
 execution:'paper_only',
 liveOrdersEnabled:false,
 brokerOrderPermission:false,
 brokerDefault:'kis',
 brokerAlternatives:Object.freeze(['toss']),
 signals:'not_connected',
 autoOrderSubmission:false,
 autoRiskMonitoring:true,
 autoWeeklyAndMonthlyReports:true,
 schedule:'shared_control_cron_existing',
 requireVerifiedFreshQuotes:true,
 maxQuoteAgeMs:AUTOPILOT_HARD_LIMITS.maxQuoteAgeMs,
 approvedOrderTypes:Object.freeze(['LIMIT']),
 prohibit:Object.freeze(['margin','leverage','derivatives','short_selling','market_orders','unapproved_live_orders'])
});
export function validatedStage2PaperPreset(){
 const {policy,valid,errors}=normalizeAutopilotPolicy(STAGE2_PAPER_PRESET);
 if(!valid||missingPolicyFields(policy).length)throw Error('STAGE2_PRESET_CONTRACT_INVALID:'+Object.keys(errors).join(','));
 return policy;
}
export function stage2PaperPresetEligibility(account){
 if(!account||account.state!=='RESEARCH_ONLY')return {eligible:false,reason:'RESEARCH_ONLY_REQUIRED'};
 if(account.liveApproval)return {eligible:false,reason:'LIVE_APPROVAL_PRESENT'};
 const keys=Object.keys(STAGE2_PAPER_PRESET);
 if(keys.some(key=>account.policy?.[key]!=null))return {eligible:false,reason:'EXISTING_POLICY_PRESERVED'};
 return {eligible:true,reason:'EMPTY_RESEARCH_POLICY'};
}
