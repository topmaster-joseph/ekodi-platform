import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INDEPENDENT_BOARD_POLICY, BOARD_ENGINE_ACTIONS, PLATFORM_BOARD_ACTIONS,
  boardActionOwner, boardRouteKey, validateBoardCategories, validateBoardRegistration,
} from '../independent-board-policy.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const constitution = readJson('../governance/constitution/constitution.json');
const workspace = readJson('../config/service-workspace-policy.json');
const currentCategories = [
  { id: 'question', label: '질문·문의' },
  { id: 'proposal', label: '정책·제도' },
  { id: 'experience', label: '의료경험' },
  { id: 'factcheck', label: '사실확인' },
  { id: 'tip', label: '자료제보' },
  { id: 'other', label: '기타' },
];
const expandedCategories = [
  ...currentCategories,
  { id: 'medical_school', label: '의대설립' },
  { id: 'regional_healthcare', label: '지역의료' },
  { id: 'university_education', label: '대학·교육' },
  { id: 'regional_economy', label: '지역경제' },
  { id: 'civic_participation', label: '시민참여' },
  { id: 'support', label: '응원·의견' },
];
function descriptor(overrides={}) {
  return {
    boardId: 'seonammedi_voices',
    engineOwner: 'independent-board-engine',
    identityAuthority: 'ekodi',
    canonicalWriteStore: 'board-engine',
    legacyWritesEnabled: false,
    serverSideAuthorization: true,
    preserveExistingRecords: true,
    slashParity: true,
    loginReturnToBoard: true,
    categories: expandedCategories,
    ...overrides,
  };
}

test('constitution and service policy inherit the independent board rule', () => {
  assert.equal(constitution.independentBoardPolicy?.id, INDEPENDENT_BOARD_POLICY.policyId);
  assert.equal(constitution.independentBoardPolicy?.inheritedWithoutServiceOptIn, true);
  assert.equal(constitution.independentBoardPolicy?.singleCanonicalWriteStore, true);
  assert.equal(constitution.independentBoardPolicy?.localOverrideForbidden, true);
  assert.equal(workspace.boardPolicy?.policyId, INDEPENDENT_BOARD_POLICY.policyId);
  assert.equal(workspace.boardPolicy?.inherited, true);
  assert.equal(workspace.boardPolicy?.globalCategoryListForced, false);
});

test('board engine and EKODI platform have disjoint operation ownership', () => {
  for (const action of BOARD_ENGINE_ACTIONS) assert.equal(boardActionOwner(action), 'independent-board-engine');
  for (const action of PLATFORM_BOARD_ACTIONS) assert.equal(boardActionOwner(action), 'ekodi-platform');
  assert.equal(boardActionOwner('unknown-action'), null);
  assert.equal(boardActionOwner('posts'), 'independent-board-engine');
});

test('slash/no-slash board paths normalize identically without swallowing API paths', () => {
  assert.equal(boardRouteKey('/board/voices'), '/board/voices');
  assert.equal(boardRouteKey('/board/voices/'), '/board/voices');
  assert.equal(boardRouteKey('/board/voices/?tab=latest'), '/board/voices');
  assert.equal(boardRouteKey('/board/api/admin/posts'), null);
  assert.equal(boardRouteKey('/board//voices'), null);
  assert.equal(boardRouteKey('https://example.org/board/voices'), null);
});

test('adding categories preserves existing six stored keys', () => {
  assert.deepEqual(validateBoardCategories(expandedCategories, currentCategories), []);
  assert.deepEqual(validateBoardRegistration(descriptor(), currentCategories), []);
  assert.ok(validateBoardCategories(expandedCategories.filter(x => x.id !== 'question'), currentCategories).some(x => x.includes('question')));
  assert.ok(validateBoardCategories([{ id: 'question', label: '질문' }, { id: 'question', label: '중복' }]).some(x => x.includes('duplicate')));
});

test('unsafe board registrations cannot silently bypass the inherited rules', () => {
  const bad = descriptor({ legacyWritesEnabled: true, engineOwner: 'platform', serverSideAuthorization: false, loginReturnToBoard: false });
  const failures = validateBoardRegistration(bad, currentCategories);
  assert.ok(failures.some(x => x.includes('legacy')));
  assert.ok(failures.some(x => x.includes('engine')));
  assert.ok(failures.some(x => x.includes('authorization')));
  assert.ok(failures.some(x => x.includes('login')));
  assert.ok(validateBoardRegistration(descriptor({ preserveExistingRecords: false })).some(x => x.includes('records')));
});
