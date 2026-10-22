// Instructor profile shown before class (presenter opening, learner lab, entry page).
// Public by design: name, public roles, operated public websites, books and a portrait the instructor cleared
// for public use (education/study/ai-bootcamp/documents/portrait.js). No phone, e-mail, address or IDs.
// Degree (박사) and the 목사 title were confirmed by the instructor on 2026-10-22.
// Gallery: stills of the official 청계면상인회 videos registered on cgma.or.kr (cgma_resources, 2026-10-22).
// They are video thumbnails served by YouTube, labelled as such, and link to the source video.

export const INSTRUCTOR=Object.freeze({
  name:'정찬균',
  nameEn:'Joseph Jeong',
  photo:'img/instructor.jpg',
  photoAlt:'정찬균 강사 사진',
  headline:'EKODI 대표 · 목사 · 경영정보시스템 박사 · AI 실무교육 강사',
  hook:'오늘 여러분이 쓰는 이 실습실도 AI와 함께 직접 만들었습니다.',
  promise:'사이트 운영·문서·회의를 AI와 함께 하는 실무자의 방법을, 바로 따라 할 수 있는 순서로 나눕니다.',
  roles:Object.freeze([
    'EKODI 생태계 대표 — 교육·연구·출판·비즈니스 플랫폼 운영',
    '에코디교회 목사',
    '국립목포대학교 경영대학원 경영정보시스템 전공 박사',
    '에코디비즈(EKODIBIZ) 대표 — 해외 하드웨어 조달·수출, AI 기반 상권 마케팅',
    '청계면상인회 회장 · 청계면 도시재생 주민협의체 간사'
  ]),
  books:Object.freeze(['에코디언을 찾아서','AI 시대의 진보와 빈곤']),
  sites:Object.freeze([
    {label:'EKODI 플랫폼',url:'https://ekodi.kr/',desc:'교육·연구·출판·비즈니스를 잇는 생태계'},
    {label:'에코디비즈',url:'https://ekodi.kr/ekodibiz',desc:'무역·AI 상권 마케팅'},
    {label:'청계면상인회',url:'https://cgma.or.kr/',desc:'지역 상권 공동체 홈페이지'},
    {label:'서남권 국립의대 소통센터',url:'https://seonammedi.kr/',desc:'지역 현안 소통 사이트'},
    {label:'에코디 서점·출판',url:'https://ekodi.kr/books',desc:'저서와 전자책'},
    {label:'에코디교회',url:'https://ekodi.kr/ekodichurch',desc:'공동체 사이트'}
  ]),
  gallery:Object.freeze([
    {src:'https://i.ytimg.com/vi/CHWgslHyHYI/hqdefault.jpg',href:'https://youtu.be/CHWgslHyHYI',alt:'2025 청계면상인회 가을 골목축제 공식 영상의 대표 장면',caption:'2025 가을 골목축제 · 청계면상인회'},
    {src:'https://i.ytimg.com/vi/aF9hOSdgXSA/hqdefault.jpg',href:'https://www.youtube.com/watch?v=aF9hOSdgXSA',alt:'2024 청계면상인회 가을 골목축제 무대 현장 영상의 대표 장면',caption:'2024 가을 골목축제 · 무대 현장'},
    {src:'https://i.ytimg.com/vi/SbIzhRrBls0/hqdefault.jpg',href:'https://youtube.com/live/SbIzhRrBls0',alt:'2025년 11월 12일 자율상권구역 지원사업 공청회 영상의 대표 장면',caption:'2025 자율상권구역 공청회'}
  ])
});
