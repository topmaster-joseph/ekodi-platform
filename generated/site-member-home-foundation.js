// GENERATED from config/site-member-home.json + workspace/capability registries. Do not edit by hand.
export const SITE_MEMBER_HOME_FOUNDATION=Object.freeze({
  "schemaVersion": 1,
  "policyId": "site-local-member-home-v1",
  "workspacePackVersion": "1.2.0",
  "capabilityRegistryVersion": "3.2.0",
  "ecosystemServiceRegistryVersion": "3",
  "core": [
    {
      "id": "core.navigator",
      "name": "AI 길찾기",
      "description": "사용자의 현재 의도·상황·목표를 이해해 적합한 활동 경로와 AI 조합을 제안한다."
    },
    {
      "id": "core.project",
      "name": "프로젝트 코치",
      "description": "목표를 프로젝트·다음 행동·점검 주기로 구조화한다."
    },
    {
      "id": "core.documents",
      "name": "문서·업무 AI",
      "description": "문서 작성·편집·계정 저장·버전 복원·AI 교정과 DOCX·HWPX 등 실사용 파일 흐름을 사람 통제 아래 지원한다."
    },
    {
      "id": "core.communication",
      "name": "소통 AI",
      "description": "메시지, 안내, 응대, 관계 중심 커뮤니케이션을 지원한다."
    },
    {
      "id": "core.analytics",
      "name": "분석·리포트 AI",
      "description": "활동·성과·운영 데이터를 읽고 의미 있는 변화와 다음 판단을 보여준다."
    }
  ],
  "common": [
    {
      "id": "core.automation",
      "name": "워크플로 자동화",
      "description": "명시적으로 위임된 반복 업무를 되돌릴 수 있는 범위에서 자동화한다."
    },
    {
      "id": "support.benefit-radar",
      "name": "혜택·지원 기회 레이더",
      "description": "명시적 동의와 공식 근거를 바탕으로 지원금·보조금·복지·장학·공모 등 받을 수 있는 기회를 찾고 자격 검토·서류 준비·기한 관리를 돕는다. 최종 자격 판정과 신청·협약 등 고영향 실행은 기관과 사람의 확인을 유지한다."
    }
  ],
  "audiencePacks": {
    "person": [
      {
        "id": "personal-starter",
        "name": "My EKODI 기본",
        "description": "누구나 시작하는 개인 활동 기본 환경.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "core.communication",
          "core.analytics",
          "support.benefit-radar"
        ]
      },
      {
        "id": "creator",
        "name": "Creator Workspace",
        "description": "글·미술·영상·음악·애니메이션 등 창작 활동을 프로젝트에서 공개까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "knowledge.research",
          "creator.writing",
          "creator.visual",
          "creator.media",
          "creator.publish",
          "creator.rights",
          "business.marketing",
          "core.public-site"
        ]
      },
      {
        "id": "learning-research",
        "name": "Learning & Research Workspace",
        "description": "배움과 연구를 자료 탐색부터 산출물까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "creator.writing",
          "core.analytics",
          "support.benefit-radar"
        ]
      },
      {
        "id": "work-career",
        "name": "Work & Career Workspace",
        "description": "진로 탐색, 취업 준비, 역량 성장과 실제 일 관리를 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "work.career",
          "support.benefit-radar"
        ]
      },
      {
        "id": "ministry-community",
        "name": "Ministry & Community Workspace",
        "description": "사역·공동체·콘텐츠·행사를 사람 중심으로 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.communication",
          "community.membership",
          "community.events",
          "ministry.service",
          "creator.writing",
          "creator.media"
        ]
      },
      {
        "id": "insurance-care",
        "name": "Insurance Care Workspace",
        "description": "보험 가입내역·보장·청구 준비와 필요 시 사람 연결, 사후 점검을 안전하게 이어가는 작업공간.",
        "capabilities": [
          "core.documents",
          "core.analytics",
          "finance.stewardship",
          "insurance.guide",
          "insurance.claims",
          "insurance.handoff",
          "insurance.analytics"
        ]
      },
      {
        "id": "energy-care",
        "name": "Energy Care Workspace",
        "description": "전기·태양광·시설 데이터를 관찰하고 개선 과제를 관리.",
        "capabilities": [
          "core.project",
          "core.analytics",
          "energy.manage"
        ]
      }
    ],
    "business": [
      {
        "id": "small-business",
        "name": "Small Business Workspace",
        "description": "소상공인과 작은 사업체의 고객·마케팅·영업·운영·재정을 연결.",
        "capabilities": [
          "core.project",
          "core.automation",
          "core.analytics",
          "business.marketing",
          "business.crm",
          "business.sales",
          "business.operations",
          "commerce.market",
          "commerce.supply-network",
          "finance.stewardship",
          "core.public-site",
          "device.observe",
          "support.benefit-radar"
        ]
      },
      {
        "id": "trade-commerce",
        "name": "Trade & Commerce Workspace",
        "description": "공급자·바이어·판매·재정·문서 흐름을 거래 단위로 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.analytics",
          "business.sales",
          "business.operations",
          "commerce.market",
          "commerce.supply-network",
          "trade.operations",
          "finance.stewardship"
        ]
      },
      {
        "id": "insurance-operations",
        "name": "Insurance Operations Workspace",
        "description": "보험 제휴주체·승인 자료·상담 연결·성과를 컴플라이언스 게이트 아래 운영.",
        "capabilities": [
          "core.project",
          "core.analytics",
          "business.crm",
          "business.operations",
          "insurance.handoff",
          "insurance.network",
          "insurance.analytics"
        ]
      },
      {
        "id": "insurance-care",
        "name": "Insurance Care Workspace",
        "description": "보험 가입내역·보장·청구 준비와 필요 시 사람 연결, 사후 점검을 안전하게 이어가는 작업공간.",
        "capabilities": [
          "core.documents",
          "core.analytics",
          "finance.stewardship",
          "insurance.guide",
          "insurance.claims",
          "insurance.handoff",
          "insurance.analytics"
        ]
      },
      {
        "id": "energy-care",
        "name": "Energy Care Workspace",
        "description": "전기·태양광·시설 데이터를 관찰하고 개선 과제를 관리.",
        "capabilities": [
          "core.project",
          "core.analytics",
          "energy.manage"
        ]
      }
    ],
    "organization": [
      {
        "id": "organization",
        "name": "Organization Workspace",
        "description": "기관·단체·협회·프로젝트 조직의 회원·문서·행사·재정·소통을 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.automation",
          "core.communication",
          "core.analytics",
          "community.membership",
          "community.events",
          "finance.stewardship",
          "core.public-site",
          "support.benefit-radar"
        ]
      },
      {
        "id": "learning-research",
        "name": "Learning & Research Workspace",
        "description": "배움과 연구를 자료 탐색부터 산출물까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "creator.writing",
          "core.analytics",
          "support.benefit-radar"
        ]
      },
      {
        "id": "ministry-community",
        "name": "Ministry & Community Workspace",
        "description": "사역·공동체·콘텐츠·행사를 사람 중심으로 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.communication",
          "community.membership",
          "community.events",
          "ministry.service",
          "creator.writing",
          "creator.media"
        ]
      },
      {
        "id": "trade-commerce",
        "name": "Trade & Commerce Workspace",
        "description": "공급자·바이어·판매·재정·문서 흐름을 거래 단위로 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.analytics",
          "business.sales",
          "business.operations",
          "commerce.market",
          "commerce.supply-network",
          "trade.operations",
          "finance.stewardship"
        ]
      },
      {
        "id": "insurance-operations",
        "name": "Insurance Operations Workspace",
        "description": "보험 제휴주체·승인 자료·상담 연결·성과를 컴플라이언스 게이트 아래 운영.",
        "capabilities": [
          "core.project",
          "core.analytics",
          "business.crm",
          "business.operations",
          "insurance.handoff",
          "insurance.network",
          "insurance.analytics"
        ]
      },
      {
        "id": "energy-care",
        "name": "Energy Care Workspace",
        "description": "전기·태양광·시설 데이터를 관찰하고 개선 과제를 관리.",
        "capabilities": [
          "core.project",
          "core.analytics",
          "energy.manage"
        ]
      }
    ],
    "church": [
      {
        "id": "organization",
        "name": "Organization Workspace",
        "description": "기관·단체·협회·프로젝트 조직의 회원·문서·행사·재정·소통을 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.automation",
          "core.communication",
          "core.analytics",
          "community.membership",
          "community.events",
          "finance.stewardship",
          "core.public-site",
          "support.benefit-radar"
        ]
      },
      {
        "id": "ministry-community",
        "name": "Ministry & Community Workspace",
        "description": "사역·공동체·콘텐츠·행사를 사람 중심으로 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.communication",
          "community.membership",
          "community.events",
          "ministry.service",
          "creator.writing",
          "creator.media"
        ]
      },
      {
        "id": "learning-research",
        "name": "Learning & Research Workspace",
        "description": "배움과 연구를 자료 탐색부터 산출물까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "creator.writing",
          "core.analytics",
          "support.benefit-radar"
        ]
      }
    ],
    "community": [
      {
        "id": "organization",
        "name": "Organization Workspace",
        "description": "기관·단체·협회·프로젝트 조직의 회원·문서·행사·재정·소통을 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.automation",
          "core.communication",
          "core.analytics",
          "community.membership",
          "community.events",
          "finance.stewardship",
          "core.public-site",
          "support.benefit-radar"
        ]
      },
      {
        "id": "ministry-community",
        "name": "Ministry & Community Workspace",
        "description": "사역·공동체·콘텐츠·행사를 사람 중심으로 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.communication",
          "community.membership",
          "community.events",
          "ministry.service",
          "creator.writing",
          "creator.media"
        ]
      },
      {
        "id": "learning-research",
        "name": "Learning & Research Workspace",
        "description": "배움과 연구를 자료 탐색부터 산출물까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "creator.writing",
          "core.analytics",
          "support.benefit-radar"
        ]
      }
    ],
    "team": [
      {
        "id": "organization",
        "name": "Organization Workspace",
        "description": "기관·단체·협회·프로젝트 조직의 회원·문서·행사·재정·소통을 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.automation",
          "core.communication",
          "core.analytics",
          "community.membership",
          "community.events",
          "finance.stewardship",
          "core.public-site",
          "support.benefit-radar"
        ]
      },
      {
        "id": "creator",
        "name": "Creator Workspace",
        "description": "글·미술·영상·음악·애니메이션 등 창작 활동을 프로젝트에서 공개까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "knowledge.research",
          "creator.writing",
          "creator.visual",
          "creator.media",
          "creator.publish",
          "creator.rights",
          "business.marketing",
          "core.public-site"
        ]
      },
      {
        "id": "learning-research",
        "name": "Learning & Research Workspace",
        "description": "배움과 연구를 자료 탐색부터 산출물까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "creator.writing",
          "core.analytics",
          "support.benefit-radar"
        ]
      }
    ],
    "project": [
      {
        "id": "organization",
        "name": "Organization Workspace",
        "description": "기관·단체·협회·프로젝트 조직의 회원·문서·행사·재정·소통을 연결.",
        "capabilities": [
          "core.project",
          "core.documents",
          "core.automation",
          "core.communication",
          "core.analytics",
          "community.membership",
          "community.events",
          "finance.stewardship",
          "core.public-site",
          "support.benefit-radar"
        ]
      },
      {
        "id": "creator",
        "name": "Creator Workspace",
        "description": "글·미술·영상·음악·애니메이션 등 창작 활동을 프로젝트에서 공개까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "knowledge.research",
          "creator.writing",
          "creator.visual",
          "creator.media",
          "creator.publish",
          "creator.rights",
          "business.marketing",
          "core.public-site"
        ]
      },
      {
        "id": "learning-research",
        "name": "Learning & Research Workspace",
        "description": "배움과 연구를 자료 탐색부터 산출물까지 연결.",
        "capabilities": [
          "core.navigator",
          "core.project",
          "core.documents",
          "knowledge.research",
          "learning.coach",
          "creator.writing",
          "core.analytics",
          "support.benefit-radar"
        ]
      }
    ]
  },
  "services": [
    {
      "id": "church",
      "name": "에코디교회",
      "nameEn": "EKODI Church",
      "url": "https://ekodi.kr/church",
      "group": "community-ministry",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "mission",
      "name": "에코디선교회",
      "nameEn": "EKODI Mission",
      "url": "https://ekodi.kr/mission",
      "group": "community-ministry",
      "status": "preparing",
      "productionVerified": true,
      "available": false
    },
    {
      "id": "bible",
      "name": "에코디 말씀대화",
      "nameEn": "EKODI Bible Conversation",
      "url": "https://ekodi.kr/bible",
      "group": "community-ministry",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "community",
      "name": "커뮤니티",
      "nameEn": "Community",
      "url": "https://ekodi.kr/community",
      "group": "community-ministry",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "social",
      "name": "에코디 소셜",
      "nameEn": "EKODI Social",
      "url": "https://ekodi.kr/social",
      "group": "community-ministry",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "cafe",
      "name": "에코디 카페",
      "nameEn": "EKODI Cafe",
      "url": "https://ekodi.kr/cafe",
      "group": "community-ministry",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "biz",
      "name": "에코디비즈",
      "nameEn": "EKODI Biz",
      "url": "https://ekodi.kr/biz",
      "group": "business-growth",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "business",
      "name": "비즈니스 OS",
      "nameEn": "Business OS",
      "url": "https://ekodi.kr/business",
      "group": "business-growth",
      "status": "beta",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "management",
      "name": "경영플랫폼",
      "nameEn": "Management Platform",
      "url": "https://ekodi.kr/management",
      "group": "business-growth",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "mall",
      "name": "에코디몰",
      "nameEn": "EKODI Mall",
      "url": "https://ekodi.kr/mall",
      "group": "business-growth",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "shop",
      "name": "쇼핑플랫폼",
      "nameEn": "Shop Platform",
      "url": "https://ekodi.kr/shop",
      "group": "business-growth",
      "status": "planned",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "delivery",
      "name": "배달허브 AI",
      "nameEn": "Delivery Hub AI",
      "url": "https://ekodi.kr/delivery",
      "group": "business-growth",
      "status": "beta",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "local-commerce",
      "name": "지역상권 상품권",
      "nameEn": "Local Commerce",
      "url": "https://ekodi.kr/local-commerce",
      "group": "business-growth",
      "status": "beta",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "marketing",
      "name": "마케팅 AI",
      "nameEn": "Marketing AI",
      "url": "https://ekodi.kr/marketing",
      "group": "business-growth",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "trade",
      "name": "에코디 트레이딩",
      "nameEn": "EKODI Trading",
      "url": "https://ekodi.kr/trade",
      "group": "business-growth",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "invest",
      "name": "에코디 투자",
      "nameEn": "EKODI Investment",
      "url": "https://ekodi.kr/invest",
      "group": "business-growth",
      "status": "beta",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "support",
      "name": "지원사업 AI",
      "nameEn": "Support Opportunity AI",
      "url": "https://ekodi.kr/support",
      "group": "business-growth",
      "status": "beta",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "money",
      "name": "에코디 머니",
      "nameEn": "EKODI Money",
      "url": "https://ekodi.kr/money",
      "group": "business-growth",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "pay",
      "name": "에코디 페이",
      "nameEn": "EKODI Pay",
      "url": "https://ekodi.kr/pay",
      "group": "business-growth",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "books",
      "name": "에코디서점",
      "nameEn": "EKODI Bookstore",
      "url": "https://ekodi.kr/books",
      "group": "knowledge-creation",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "publishing",
      "name": "출판",
      "nameEn": "Publishing",
      "url": "https://ekodi.kr/publishing",
      "group": "knowledge-creation",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "journal",
      "name": "에코디 저널",
      "nameEn": "EKODI Journal",
      "url": "https://ekodi.kr/journal",
      "group": "knowledge-creation",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "author",
      "name": "크리에이터 AI",
      "nameEn": "Creator AI",
      "url": "https://ekodi.kr/author",
      "group": "knowledge-creation",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "lab",
      "name": "에코디연구소",
      "nameEn": "EKODI Lab",
      "url": "https://ekodi.kr/lab",
      "group": "knowledge-creation",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "edu",
      "name": "에코디교육",
      "nameEn": "EKODI Education",
      "url": "https://ekodi.kr/edu",
      "group": "knowledge-creation",
      "status": "planned",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "learn",
      "name": "EKODI Learning Fabric",
      "nameEn": "EKODI Learning Fabric",
      "url": "https://ekodi.kr/learn",
      "group": "knowledge-creation",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "life",
      "name": "오늘의 질문",
      "nameEn": "Life AI",
      "url": "https://ekodi.kr/life",
      "group": "work-life",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "my",
      "name": "마이 에코디",
      "nameEn": "My EKODI",
      "url": "https://ekodi.kr/my",
      "group": "work-life",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "work",
      "name": "에코디 워크",
      "nameEn": "EKODI Work",
      "url": "https://ekodi.kr/work",
      "group": "work-life",
      "status": "live",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "energy",
      "name": "에너지 AI",
      "nameEn": "Energy AI",
      "url": "https://ekodi.kr/energy",
      "group": "work-life",
      "status": "beta",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "insurance",
      "name": "에코디보험",
      "nameEn": "EKODI Insurance",
      "url": "https://ekodi.kr/insurance",
      "group": "work-life",
      "status": "beta",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "messenger",
      "name": "에코디 메신저",
      "nameEn": "EKODI Messenger",
      "url": "https://ekodi.kr/messenger",
      "group": "communication-cloud",
      "status": "beta",
      "productionVerified": true,
      "available": true
    },
    {
      "id": "mail",
      "name": "에코디 메일",
      "nameEn": "EKODI Mail",
      "url": "https://ekodi.kr/mail",
      "group": "communication-cloud",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "live",
      "name": "에코디 라이브",
      "nameEn": "EKODI Live",
      "url": "https://ekodi.kr/live",
      "group": "communication-cloud",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "cloud",
      "name": "에코디 클라우드",
      "nameEn": "EKODI Cloud",
      "url": "https://ekodi.kr/cloud",
      "group": "communication-cloud",
      "status": "preparing",
      "productionVerified": false,
      "available": false
    },
    {
      "id": "media",
      "name": "에코디미디어",
      "nameEn": "EKODI Media",
      "url": "https://ekodi.kr/media",
      "group": "communication-cloud",
      "status": "planned",
      "productionVerified": false,
      "available": false
    }
  ],
  "canonical": {
    "globalPersonalHome": "https://ekodi.kr/my/",
    "serviceMemberHome": "https://ekodi.kr/{canonical-service-path}/my",
    "serviceAliasMemberHome": "https://ekodi.kr/{service-id}/my",
    "workspaceMemberHome": "https://ekodi.kr/{slug}/my",
    "loginReturnPolicy": "site-local-member-home",
    "subdomainMemberHomes": "non-canonical"
  },
  "customization": {
    "scope": "subject-plus-site",
    "presentationOnly": true,
    "doesNotGrantAuthorization": true,
    "preferences": [
      "pinnedServices",
      "hiddenServices",
      "serviceOrder",
      "density"
    ],
    "storage": "site_member_home_preferences"
  },
  "privacy": {
    "privateByDefault": true,
    "crossWorkspacePrivateDataSharing": false,
    "publicIndexing": false
  }
});
export function foundationForAudience(value){const key=String(value||'person').trim().toLowerCase();return Object.freeze({...SITE_MEMBER_HOME_FOUNDATION,specialist:SITE_MEMBER_HOME_FOUNDATION.audiencePacks[key]||SITE_MEMBER_HOME_FOUNDATION.audiencePacks.person||[]});}
