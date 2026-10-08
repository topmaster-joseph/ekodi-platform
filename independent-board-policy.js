// EKODI BOARD-INDEPENDENT-001: reusable contract for all current/future boards.
// Registration callers must reject a descriptor when validateBoardRegistration reports errors.
export const INDEPENDENT_BOARD_POLICY = Object.freeze({
  policyId: 'BOARD-INDEPENDENT-001',
  scope: 'all-current-and-future-site-boards',
  engineOwner: 'independent-board-engine',
  identityAuthority: 'ekodi',
  inherited: true,
  legacyWriteForbidden: true,
  singleCanonicalWriteStore: true,
});

export const BOARD_ENGINE_ACTIONS = Object.freeze([
  'posts', 'replies', 'attachments', 'categories', 'search', 'edit', 'delete', 'audit',
]);
export const PLATFORM_BOARD_ACTIONS = Object.freeze([
  'authentication', 'authorization-handoff', 'site-routing',
]);
const BOARD_ACTIONS = new Set(BOARD_ENGINE_ACTIONS);
const PLATFORM_ACTIONS = new Set(PLATFORM_BOARD_ACTIONS);
const BOARD_KEY = /^[a-z][a-z0-9_-]*$/;

export function boardActionOwner(action) {
  const value = String(action || '').trim().toLowerCase();
  if (BOARD_ACTIONS.has(value)) return 'independent-board-engine';
  if (PLATFORM_ACTIONS.has(value)) return 'ekodi-platform';
  return null;
}

export function boardRouteKey(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.includes('//')) return null;
  const path = pathname.split(/[?#]/, 1)[0];
  if (!/^\\/board\\/[a-z0-9_-]+\\/?$/i.test(path)) return null;
  return path.replace(/\\/$/, '').toLowerCase();
}

export function validateBoardCategories(categories, previousCategories = []) {
  const errors = [];
  if (!Array.isArray(categories) || categories.length === 0) return ['categories must be a non-empty array'];
  const keys = new Set();
  for (const category of categories) {
    const id = category?.id;
    if (typeof id !== 'string' || !BOARD_KEY.test(id)) errors.push('category id must be a stable lowercase key');
    else if (keys.has(id)) errors.push(`duplicate category id: ${id}`);
    else keys.add(id);
    if (!String(category?.label || '').trim()) errors.push(`category ${id || '(missing)'} needs a display label`);
  }
  for (const item of previousCategories || []) {
    if (!keys.has(item.id)) errors.push(`previous category id must remain readable: ${item.id}`);
  }
  return errors;
}

export function validateBoardRegistration(board, previousCategories = []) {
  const errors = [];
  if (!board || typeof board !== 'object') return ['board descriptor is required'];
  if (!BOARD_KEY.test(String(board.boardId || ''))) errors.push('boardId must be stable');
  if (board.engineOwner !== 'independent-board-engine') errors.push('board engine must own board writes');
  if (board.identityAuthority !== 'ekodi') errors.push('EKODI must remain the identity authority');
  if (board.canonicalWriteStore !== 'board-engine') errors.push('one canonical board-engine write store is required');
  if (board.legacyWritesEnabled !== false) errors.push('legacy board writes must be disabled');
  if (board.serverSideAuthorization !== true) errors.push('server-side authorization is mandatory');
  if (board.preserveExistingRecords !== true) errors.push('existing records must be preserved');
  if (board.slashParity !== true) errors.push('slash and slashless entry must agree');
  if (board.loginReturnToBoard !== true) errors.push('login must return to the original board');
  errors.push(...validateBoardCategories(board.categories, previousCategories));
  return errors;
}
