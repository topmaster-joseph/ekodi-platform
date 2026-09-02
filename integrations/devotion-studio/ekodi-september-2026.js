export const EKODI_SEPTEMBER_2026 = Object.freeze([
  '신명기 14:22-29',
  '신명기 15:1-11',
  '신명기 15:12-23',
  '신명기 16:1-12',
  '신명기 16:13-22',
  '신명기 17:1-13',
  '신명기 17:14-20',
  '신명기 18:1-14',
  '신명기 18:15-22',
  '신명기 19:1-13',
  '신명기 19:14-21',
  '신명기 20:1-9',
  '신명기 20:10-20',
  '신명기 21:1-9',
  '신명기 21:10-21',
  '신명기 21:22-22:12',
  '신명기 22:13-21',
  '신명기 22:22-30',
  '신명기 23:1-8',
  '신명기 23:9-14',
  '신명기 23:15-25',
  '신명기 24:1-13',
  '신명기 24:14-22',
  '신명기 25:1-12',
  '신명기 25:13-19',
  '신명기 26:1-11',
  '신명기 26:12-19',
  '신명기 27:1-10',
  '신명기 27:11-26',
  '신명기 28:1-14'
]);

const EDITORIAL_GUIDANCE = [
  '본문에 충실하되 삶으로 살아내는 방향을 분명히 한다.',
  '에클레시아·코이노니아·디아스포라·희년의 가치는 본문이 실제로 여는 날에만 자연스럽게 연결하고 억지로 끼워 넣지 않는다.',
  '개인 경건에서 멈추지 않고 이웃과 공동체를 살리는 구체적 실천을 찾는다.',
  '짧아도 반전이나 질문이 있는 한 가지 중심 통찰을 남긴다.'
].join(' ');

export function buildEkodiSeptemberBatch({ workspaceId, churchTargetRef = '', missionTargetRef = '' }) {
  if (!workspaceId) throw new Error('DEVOTION_STUDIO_WORKSPACE_ID is required');
  return {
    workspace_id: workspaceId,
    batch_key: '2026-09',
    title: '2026년 9월 매일묵상',
    items: EKODI_SEPTEMBER_2026.map((passage, index) => ({
      id: String(index + 1).padStart(2, '0'),
      passage,
      metadata: {
        devotion_date: `2026-09-${String(index + 1).padStart(2, '0')}`,
        editorial_guidance: EDITORIAL_GUIDANCE,
        duration_seconds: 30,
        voice_style: '차분하고 따뜻하며 또렷한 한국어 묵상 낭독. 과장하지 않고 문장의 의미에 따라 자연스럽게 호흡한다.'
      }
    })),
    publication_targets: [
      {
        id: 'church', kind: 'youtube', config_ref: churchTargetRef,
        metadata: { label: '에코디교회', default_publish_time: '06:00', brand_key: 'church' }
      },
      {
        id: 'mission', kind: 'youtube', config_ref: missionTargetRef,
        metadata: { label: '에코디선교회', default_publish_time: '07:00', brand_key: 'mission' }
      }
    ]
  };
}
