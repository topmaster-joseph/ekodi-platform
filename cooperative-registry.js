// Workspace IDs are immutable; slugs are routing locators, never access grants.
export const COOPERATIVES = Object.freeze([
  Object.freeze({
    workspaceId: 'c88205a8-9a6c-4c51-ae52-508c087a2d50',
    slug: 'jubilee-distribution', publicSlug: 'jubilee', name: '희년세상협동조합',
    legalName: '희년세상협동조합', chair: '정찬균', mark: '희', tone: 'jubilee',
    representatives: Object.freeze(['정찬균', '박은희', '최병천', '정양기', '조인식']),
  }),
  Object.freeze({
    workspaceId: 'ac8c6bf7-f5e6-4e5a-86cb-9a5bc9391a54',
    slug: 'open-distribution', publicSlug: 'open', name: '열린유통협동조합',
    legalName: '열린유통협동조합', chair: '임동섭', mark: '열', tone: 'open',
    representatives: Object.freeze(['임동섭', '이상호', '이남현1', '이남현2', '이남현3']),
  }),
]);

export const COOP_DOCUMENTS = Object.freeze([
  ['charter', '정관 사본'], ['notice', '창립총회 개최 공고문'],
  ['minutes', '창립총회 의사록'], ['officers', '임원 명부'],
  ['plan', '사업계획서'], ['budget', '수입·지출 예산서'],
  ['capital', '출자자명부'], ['founders', '발기인 및 설립동의자 명부'],
]);

export function cooperativeBySlug(slug) {
  const locator = String(slug || '').toLowerCase();
  return COOPERATIVES.find(coop => coop.slug === locator || coop.publicSlug === locator) || null;
}

export function cooperativeInitialState(coop) {
  return {
    profile: {
      name: coop.name, legalName: coop.legalName, legalNameStatus: 'draft',
      chair: coop.chair, status: 'formation',
      purpose: '자주적·자립적·자치적인 협동조합 활동을 통해 구성원의 복리증진과 상부상조, 지역경제의 균형 있는 발전에 기여합니다.',
      industries: '농산물·수산물 가공 및 도소매업, 통신판매업. 공산품유통업 사업자도 참여할 수 있습니다.',
      businesses: '농수산물 공동유통·가공·도소매, 통신판매, 공동구매·공동판매·공동브랜드, 교육·정보제공, 조합 간 협력 및 지역사회 사업',
      office: '광주광역시', officeConfirmed: false, businessArea: '', jurisdiction: '광주광역시',
      shareUnit: 10000, firstYearBudget: null, fiscalEndMonth: 12,
      directorsMinimum: 3, directorsMaximum: 5, auditorsMinimum: 1, auditorsMaximum: 2, termYears: 4,
    },
    founders: coop.representatives.map((representative, index) => ({
      id: `${coop.workspaceId}:founder:${index + 1}`, representative,
      position: index === 0 ? 'chair-designate' : 'founder',
      business: null, industry: null, shares: null, consent: 'pending',
      accountEmail: null,
    })),
    documents: Object.fromEntries(COOP_DOCUMENTS.map(([id]) => [id, { status: 'pending', note: '' }])),
    dates: { foundingMeetingDate: '', filingDate: '', confirmationDate: '', capitalPaidDate: '', registrationDate: '' },
    notices: [], meetings: [], supports: [],
  };
}

export function cooperativePublicProjection(coop, state = cooperativeInitialState(coop)) {
  const p = state.profile;
  return {
    workspaceId: coop.workspaceId, slug: coop.slug, publicSlug: coop.publicSlug, name: p.name,
    legalName: p.legalName, legalNameStatus: p.legalNameStatus, chair: p.chair,
    status: 'formation', purpose: p.purpose, industries: p.industries, businesses: p.businesses,
    office: p.officeConfirmed ? p.office : '', shareUnit: p.shareUnit,
    notices: state.notices.filter(n => n.visibility === 'public' && n.status === 'published')
      .map(({ id, title, body, createdAt }) => ({ id, title, body, createdAt })),
  };
}
