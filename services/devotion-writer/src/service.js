const required = (value, name) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
};

export const DEVOTION_DRAFT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    title: { type: 'string' },
    narration: { type: 'string' },
    core: { type: 'string' },
    application_question: { type: 'string' },
    prayer: { type: 'string' },
    publish_title: { type: 'string' },
    description: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'narration', 'core', 'application_question', 'prayer', 'publish_title', 'description', 'hashtags']
});

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const lengthOk = (value, min, max) => clean(value).length >= min && clean(value).length <= max;

export function validateDevotionDraft(input) {
  const draft = {
    title: clean(input?.title),
    narration: clean(input?.narration),
    core: clean(input?.core),
    application_question: clean(input?.application_question),
    prayer: clean(input?.prayer),
    publish_title: clean(input?.publish_title),
    description: String(input?.description ?? '').trim(),
    hashtags: Array.isArray(input?.hashtags) ? input.hashtags.map(clean).filter(Boolean).slice(0, 8) : []
  };
  const issues = [];
  if (!lengthOk(draft.title, 4, 60)) issues.push('title_length');
  if (!lengthOk(draft.narration, 180, 520)) issues.push('narration_length');
  if (!lengthOk(draft.core, 8, 100)) issues.push('core_length');
  if (!lengthOk(draft.application_question, 8, 140)) issues.push('application_question_length');
  if (!lengthOk(draft.prayer, 12, 180)) issues.push('prayer_length');
  if (!lengthOk(draft.publish_title, 4, 100)) issues.push('publish_title_length');
  if (!draft.description) issues.push('description_required');
  if (draft.hashtags.length < 2) issues.push('hashtags_required');
  const risky = /하나님(?:께서|이)\s*(?:지금|오늘)\s*(?:당신|너)에게\s*(?:직접\s*)?(?:말씀|명령)/;
  if (risky.test(draft.narration)) issues.push('direct_divine_claim');
  if (/큐티인|QTIN|큐티엠/i.test(draft.narration + draft.description)) issues.push('commentary_reference');
  return { ok: issues.length === 0, issues, draft };
}

export function buildDevotionPrompt({ passage, date = '', metadata = {}, previousIssues = [] }) {
  const guidance = clean(metadata.editorial_guidance || '');
  return [
    '역할: 짧지만 얕지 않은 한국어 성경 묵상 원고를 쓰는 편집자.',
    `본문: ${required(passage, 'passage')}`,
    date ? `날짜: ${date}` : '',
    guidance ? `편집 방향: ${guidance}` : '',
    '목표: 약 30초 세로영상용 원고. 한 가지 본문 긴장을 붙들고 삶의 장면으로 연결한다.',
    '본문에 없는 세부 사실을 지어내지 않는다. 정확한 절 문구가 확실하지 않으면 직접 인용하지 말고 의미를 요약한다.',
    '외부 묵상집·주석의 문장을 복제하지 않는다. 특히 QTIN/큐티인 해설을 인용하거나 흉내내지 않는다.',
    '상투적인 위로나 추상어로 끝내지 말고 본문 관찰 → 복음적/신학적 통찰 → 오늘의 구체적 실천이 자연스럽게 이어지게 한다.',
    '하나님이 시청자 개인에게 특정 내용을 직접 말씀하셨다고 선언하거나 예언하지 않는다.',
    '죄책감·공포를 조작하지 않는다. 민감한 본문은 피해자의 존엄과 안전을 훼손하지 않도록 다룬다.',
    'narration은 한국어 180~520자, 자연스러운 구어체 4~7문장. core는 기억할 한 문장.',
    'publish_title은 짧고 후킹하되 성경본문 표기는 넣지 않는다. description에는 본문 표기와 핵심을 간결히 적는다.',
    'hashtags는 2~6개, application_question은 실제 행동을 돌아보게 하는 한 질문, prayer는 짧은 기도 한 단락.',
    previousIssues.length ? `이전 초안의 품질 문제를 반드시 수정: ${previousIssues.join(', ')}` : '',
    '지정된 JSON 스키마만 반환한다.'
  ].filter(Boolean).join('\n');
}

export function createDevotionWriter({ providers = [] } = {}) {
  const available = () => providers.filter(provider => provider?.ready?.());
  return {
    ready() { return available().map(provider => provider.id || 'provider'); },
    async write(input = {}) {
      const passage = required(input.passage, 'passage');
      const usable = available();
      if (!usable.length) {
        const error = new Error('no devotional writer provider is connected');
        error.code = 'WRITER_NOT_CONNECTED';
        throw error;
      }
      let lastError;
      for (const provider of usable) {
        let issues = [];
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const generated = await provider.generate({
              prompt: buildDevotionPrompt({ passage, date: input.date, metadata: input.metadata, previousIssues: issues }),
              schema: DEVOTION_DRAFT_SCHEMA
            });
            const checked = validateDevotionDraft(generated.data);
            if (checked.ok) return { ...checked.draft, provider: generated.provider || provider.id || '', provider_model: generated.model || '' };
            issues = checked.issues;
            lastError = new Error(`draft quality gate failed: ${issues.join(', ')}`);
            lastError.code = 'WRITER_QUALITY_GATE_FAILED';
          } catch (error) {
            lastError = error;
            break;
          }
        }
      }
      throw lastError || new Error('devotional writer failed');
    }
  };
}
