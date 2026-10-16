// Public editorial imagery only; these scenes do not identify real members or facilities.
export const COOPERATIVE_HERO_IMAGES = Object.freeze({
  'jubilee-distribution': Object.freeze({
    small: '/business-coop/images/jubilee-hero-640-ec98e7d14c.webp',
    large: '/business-coop/images/jubilee-hero-1280-bb3fdd3958.webp',
    alt: '들판 옆 작업장에서 신선한 채소와 과일을 수확 상자에 담는 모습을 표현한 AI 생성 이미지',
  }),
  'open-distribution': Object.freeze({
    small: '/business-coop/images/open-hero-640-44e3f897ef.webp',
    large: '/business-coop/images/open-hero-1280-90d31bae48.webp',
    alt: '공동 작업대에서 채소와 과일을 함께 포장하는 모습을 표현한 AI 생성 이미지',
  }),
});

// Both draft charters cover the same business areas. Shared editorial scenes
// illustrate those clauses; the distinct hero photos retain each site's tone.
export const COOPERATIVE_BUSINESS_IMAGES = Object.freeze([
  Object.freeze({
    small: '/business-coop/images/agri-fish-640-b5afa995ee.webp',
    large: '/business-coop/images/agri-fish-960-06f299657d.webp',
    alt: '농산물과 포장된 수산물을 구분해 검수하는 가공·유통 준비 장면을 표현한 AI 생성 이미지',
    title: '농수산물 가공·공동유통',
    description: '농산물·수산물의 가공과 도소매, 공동구매를 잇는 유통 기반을 준비합니다.',
    tag: '가공 · 도소매 · 공동구매',
  }),
  Object.freeze({
    small: '/business-coop/images/joint-sales-640-8eeb4376e1.webp',
    large: '/business-coop/images/joint-sales-960-249584ff76.webp',
    alt: '온라인 주문을 확인하고 상품을 함께 포장하는 공동판매 장면을 표현한 AI 생성 이미지',
    title: '통신판매·공동판매',
    description: '온라인 공동판매와 공동브랜드, 포장·배송 지원으로 조합원의 상품을 연결합니다.',
    tag: '통신판매 · 공동브랜드 · 배송',
  }),
  Object.freeze({
    small: '/business-coop/images/learning-640-b6d2474bb2.webp',
    large: '/business-coop/images/learning-960-498ffabc71.webp',
    alt: '지역의 소규모 교육 모임에서 운영 정보를 나누는 협력 장면을 표현한 AI 생성 이미지',
    title: '교육·훈련·지역협력',
    description: '조합원과 직원을 위한 교육·정보제공, 조합 간 협력과 지역사회 사업을 준비합니다.',
    tag: '교육 · 정보공유 · 조합 간 협력',
  }),
]);

export const COOPERATIVE_IMAGE_PATHS = new Set([
  ...Object.values(COOPERATIVE_HERO_IMAGES), ...COOPERATIVE_BUSINESS_IMAGES,
].flatMap(image => [image.small, image.large]));
