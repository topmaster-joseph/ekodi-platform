// Pure permission contract used by Community API and deterministic Node tests.
// A service-role database client must never be treated as permission to reveal member content.
export const READING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const READING_KINDS = Object.freeze(['question', 'reflection', 'action', 'reply']);
export const READING_SCOPES = Object.freeze(['private', 'circle']);
export const READING_STATUSES = Object.freeze(['planned', 'done', 'cancelled']);

export function readingAccess(circle, member, workspace, userId) {
  if (!circle || circle.status !== 'active') return { allowed: false, manager: false, error: 'circle_not_found', status: 404 };
  const tenantId = circle.workspace_tenant_id || null;
  if (tenantId !== (workspace?.tenantId || null)) return { allowed: false, manager: false, error: 'circle_not_found', status: 404 };
  if (tenantId && workspace?.member !== true) return { allowed: false, manager: false, error: 'workspace_membership_required', status: 403 };
  if (!member || member.user_id !== userId || member.circle_id !== circle.id || member.status !== 'active') {
    return { allowed: false, manager: false, error: 'circle_membership_required', status: 403 };
  }
  const manager = (member.role === 'owner' && circle.owner_user_id === userId) || member.role === 'leader';
  return { allowed: true, manager, error: null, status: 200 };
}

export function readingMemberDecision(actorAccess, target, decision, activeCount, capacity) {
  if (!actorAccess?.allowed || !actorAccess.manager) return 'manager_required';
  if (!target || target.status !== 'pending' || target.role !== 'member') return 'not_pending';
  if (!['approve', 'decline'].includes(decision)) return 'invalid_decision';
  if (decision === 'approve' && Number.isFinite(capacity) && capacity > 0 && activeCount >= capacity) return 'circle_full';
  return null;
}

export function readingVisible(entry, userId) {
  return Boolean(entry && !entry.deleted_at && (entry.scope === 'circle' || entry.author_user_id === userId));
}

export function readingInput(body = {}) {
  const kind = String(body.kind || 'reflection');
  const scope = String(body.scope || 'private');
  const content = String(body.content || '').trim();
  if (!READING_KINDS.includes(kind)) return { error: 'invalid_kind' };
  if (!READING_SCOPES.includes(scope)) return { error: 'invalid_scope' };
  if (!content || content.length > 2500) return { error: 'content_length' };
  if (scope === 'circle' && body.share_to_circle !== true) return { error: 'explicit_share_required' };
  if (body.parent_id && !READING_UUID.test(String(body.parent_id))) return { error: 'invalid_parent' };
  if (kind === 'reply' && !body.parent_id) return { error: 'reply_requires_parent' };
  if (kind !== 'reply' && body.parent_id) return { error: 'parent_not_allowed' };
  return { kind, scope, content, parentId: body.parent_id ? String(body.parent_id) : null };
}

export function readingDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
