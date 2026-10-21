import { adaptBenefitRadarAssessment } from './jubilee-benefit-radar-adapter.js';
import { buildJubileeCapabilityRequest } from './jubilee-capability-provider.js';

/**
 * Cross-service boundary owned by EKODI Support.
 * Raw Support profiles, match scores and eligibility reasons never cross it.
 */
export function buildSupportJubileeSignalRequest(input = {}) {
  if (input.consent?.jubilee !== true && input.jubileeConsent !== true) {
    throw new Error('support_jubilee_consent_required');
  }

  const adapted = adaptBenefitRadarAssessment(input.assessment || {});
  const contextProjection = {
    supportSignals: adapted.context.needSignals.map(signal => ({
      type: signal.type,
      source: signal.source,
    })),
  };
  if (adapted.supportRef) contextProjection.support_ref = adapted.supportRef;

  return buildJubileeCapabilityRequest({
    request_id: input.request_id || input.requestId,
    capability_id: 'jubilee-policy-gate',
    operation: 'adapt_support',
    context_projection: contextProjection,
    constraints: {
      source_boundary: 'support',
      minimum_data_projection: true,
      matching_score_shared: false,
      beneficiary_identity_shared: false,
      human_approval_required_for_pool: true,
    },
  });
}
