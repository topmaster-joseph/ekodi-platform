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

export const COOPERATIVE_IMAGE_PATHS = new Set(Object.values(COOPERATIVE_HERO_IMAGES).flatMap(image => [image.small, image.large]));
