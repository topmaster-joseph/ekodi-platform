import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgeEvidenceContext,
  evaluateKnowledgeEvidence,
  guardKnowledgeResponse,
  knowledgeGateRequired,
  normalizeKnowledgeTaskInput,
} from '../ai-knowledge-claim.js';

const NOW=Date.parse('2026-09-23T12:00:00.000Z');

function task(overrides={}){
  return {
    prompt:'현재 공식 요금이 얼마인지 검색해서 근거와 함께 알려줘',
    knowledge:{
      required:true,
      temporalSensitivity:'current',
      highImpact:false,
      contested:false,
      claimScope:'service:pricing',
      maxAgeSeconds:604800,
      requirePrimary:false,
      minIndependentSources:1,
      citationRequired:true,
      ...overrides,
    },
  };
}

function source(overrides={}){
  return {
    sourceId:'official-pricing',
    sourceType:'official_primary',
    claimScope:'service:pricing',
    relation:'supports',
    title:'Official pricing',
    url:'https://example.com/pricing',
    authority:'Example',
    publisherKey:'example.com',
    retrievedAt:'2026-09-23T11:55:00.000Z',
    effectiveAt:'2026-09-23T11:00:00.000Z',
    currentPrimary:true,
    factSummary:'The current listed price is 10.',
    citationToken:'K1',
    ...overrides,
  };
}

test('current, research and high-impact prompts require the knowledge gate',()=>{
  assert.equal(knowledgeGateRequired({prompt:'최신 뉴스 검색해줘'}),true);
  assert.equal(knowledgeGateRequired({prompt:'논문 근거를 찾아줘'}),true);
  assert.equal(normalizeKnowledgeTaskInput({prompt:'세금 규정이 어떻게 되지?'}).highImpact,true);
});

test('retrieval alone is not verification without explicit support relation',()=>{
  const result=evaluateKnowledgeEvidence(task(),[source({relation:'context'})],{nowMs:NOW});
  assert.equal(result.verdict,'insufficient');
});

test('fresh official primary evidence verifies a scoped current claim',()=>{
  const result=evaluateKnowledgeEvidence(task(),[source()],{nowMs:NOW});
  assert.equal(result.verdict,'verified');
  assert.equal(result.hasPrimary,true);
});

test('stale current evidence cannot be promoted to current fact',()=>{
  const result=evaluateKnowledgeEvidence(task(),[source({retrievedAt:'2026-08-01T00:00:00.000Z',effectiveAt:'2026-08-01T00:00:00.000Z'})],{nowMs:NOW});
  assert.equal(result.verdict,'stale');
});

test('model-generated material is never sufficient external evidence',()=>{
  const result=evaluateKnowledgeEvidence(task(),[source({sourceType:'model_generated'})],{nowMs:NOW});
  assert.equal(result.verdict,'source_quality_low');
});

test('scope mismatch rejects otherwise strong evidence',()=>{
  const result=evaluateKnowledgeEvidence(task(),[source({claimScope:'service:other'})],{nowMs:NOW});
  assert.equal(result.verdict,'insufficient');
  assert.ok(result.reasons.includes('scope_mismatch_rejected'));
});

test('credible contradictory evidence blocks unqualified factual assertion',()=>{
  const result=evaluateKnowledgeEvidence(task({contested:true,minIndependentSources:2}),[
    source(),
    source({sourceId:'regulator',citationToken:'K2',relation:'contradicts',publisherKey:'regulator.example',url:'https://regulator.example/fact',sourceType:'authoritative_reference'}),
  ],{nowMs:NOW});
  assert.equal(result.verdict,'contradicted');
});

test('high-impact claim requires authoritative evidence and corroboration unless authoritative single source owns the fact',()=>{
  const weak=evaluateKnowledgeEvidence(task({highImpact:true,requirePrimary:true,minIndependentSources:2}),[
    source({sourceType:'secondary_reference',currentPrimary:false}),
  ],{nowMs:NOW});
  assert.notEqual(weak.verdict,'verified');

  const official=evaluateKnowledgeEvidence(task({highImpact:true,requirePrimary:true,minIndependentSources:2}),[
    source({sourceType:'official_primary',currentPrimary:true}),
  ],{nowMs:NOW});
  assert.equal(official.verdict,'verified');
});

test('verified knowledge is still blocked when final response omits traceable citation token',()=>{
  const result=guardKnowledgeResponse('현재 가격은 10입니다.',task(),[source()],{nowMs:NOW});
  assert.equal(result.allowed,false);
  assert.equal(result.verdict,'citation_missing');
});

test('verified knowledge with citation token may pass final response gate',()=>{
  const result=guardKnowledgeResponse('현재 가격은 10입니다. [K1]',task(),[source()],{nowMs:NOW});
  assert.equal(result.allowed,true);
  assert.equal(result.verdict,'verified');
  assert.equal(result.receipt.policyId,'AI-KNOWLEDGE-CLAIM-001');
});

test('knowledge evidence context labels external summaries as untrusted data',()=>{
  const context=buildKnowledgeEvidenceContext(task(),[source()]);
  assert.match(context,/untrusted reference data/);
  assert.match(context,/\[K1\]/);
});
