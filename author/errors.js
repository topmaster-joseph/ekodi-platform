const MESSAGES = [
  ['AUTHOR_APPROVAL_REQUIRES_COMPLETE_REVIEWED_MANUSCRIPT', '모든 장에 초고가 있고 검토 완료되어야 최종 승인할 수 있습니다.'],
  ['AUTHOR_APPROVAL_REQUIRES_REVIEW', '최종 승인 전에 먼저 REVIEW 단계로 이동해 주세요.'],
  ['PUBLISH_READY_REQUIRES_AUTHOR_APPROVAL', 'EKODI BOOKS로 넘기기 전에 저자의 최종 승인이 필요합니다.'],
  ['PUBLICATION_PACKAGE_REQUIRES_COMPLETE_REVIEWED_MANUSCRIPT', '출판 패키지를 만들 수 없습니다. 비어 있거나 검토되지 않은 장을 먼저 확인해 주세요.'],
];

window.addEventListener('unhandledrejection', event => {
  const text = String(event.reason?.message || event.reason || '');
  const match = MESSAGES.find(([code]) => text.includes(code));
  if (!match) return;
  event.preventDefault();
  window.alert(match[1]);
});
