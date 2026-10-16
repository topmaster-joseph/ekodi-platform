import test from 'node:test';
import assert from 'node:assert/strict';
import {createProposalDraft} from '../proposal/core.js';
import {makeGuidedProposalDraft} from '../proposal/analysis.js';
test('draft remains unverified',()=>{const draft=createProposalDraft({title:'기획'}); const result=makeGuidedProposalDraft(draft);assert.match(result.draft.sections[0].body,/검증 전/);});
