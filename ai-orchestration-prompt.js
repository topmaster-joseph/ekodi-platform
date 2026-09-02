function compact(value, max = 8_000) { return String(value ?? '').trim().slice(0, max); }

export function buildOrchestrationPrompt(context = {}) {
  const meta = context?._ekodiOrchestration;
  if (!meta || typeof meta !== 'object') return '';
  if (meta.phase === 'independent_review') {
    return [
      'EKODI Orchestrator 독립 검토 단계입니다.',
      '다른 AI의 답을 추정하거나 따라 하지 말고, 사실·위험·대안·검증 포인트를 독립적으로 판단하세요.',
      '운영·보안·재무·권한 등 고영향 사안은 실행 승인과 분석을 구분하고, 검증되지 않은 실행 완료를 주장하지 마세요.',
      `병렬 검토 이유: ${compact(meta.plan?.reason, 120) || 'adaptive_cross_check'}`,
    ].join('\n');
  }
  if (meta.phase === 'synthesis') {
    const reviews = (Array.isArray(meta.peerReviews) ? meta.peerReviews : []).slice(0, 3)
      .map((review, index) => `검토 ${index + 1} (${compact(review?.provider, 80) || 'provider'}):\n${compact(review?.text, 3_500)}`)
      .join('\n\n');
    return [
      'EKODI Orchestrator 최종 합성 단계입니다.',
      '아래 독립 검토들을 비교하여 공통 사실, 중요한 차이, 위험을 판별하고 하나의 일관된 최종 답변으로 통합하세요.',
      '다수결만 따르지 말고 근거가 강한 쪽을 우선하세요. 불확실한 부분은 불확실하다고 표시하세요.',
      '고영향 실행은 기존 Human Gate와 권한 정책을 절대 우회하지 마세요.',
      `교차검증 정족수 충족: ${meta.quorumMet === false ? '아니오' : '예'}`,
      '',
      reviews,
    ].join('\n');
  }
  return '';
}
