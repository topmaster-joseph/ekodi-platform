import { READING_UUID, readingAccess, readingInput, readingVisible, readingDate } from './reading-policy.js';

type RequestContext = {
  userId: string;
  workspace: { tenantId?: string | null; member?: boolean };
  admin: any;
  json: (req: Request, body: unknown, status?: number) => Response;
};

const short = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);
const failure = (req: Request, ctx: RequestContext, error: string, status = 400) =>
  ctx.json(req, { error }, status);
const one = async (query: any) => {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
};
const many = async (query: any) => {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};
const readingError = (error: any) => {
  if (['42P01', 'PGRST205', 'PGRST204', '42883'].includes(String(error?.code))) return 'reading_not_ready';
  return 'reading_api_failed';
};
async function audit(admin: any, circleId: string, actorId: string, action: string, targetId: string | null = null) {
  const { error } = await admin.from('community_reading_audit').insert({
    circle_id: circleId, actor_user_id: actorId, action, target_id: targetId,
  });
  if (error) throw error;
}

/** Server-only endpoints: no client role/tenant/status claims are trusted. */
export async function handleReading(req: Request, path: string, ctx: RequestContext): Promise<Response | null> {
  const match = path.match(/^\/circles\/([0-9a-f-]{36})\/reading(?:\/(.*))?$/i);
  if (!match) return null;
  const circleId = match[1];
  if (!READING_UUID.test(circleId)) return failure(req, ctx, 'not_found', 404);
  const tail = match[2] || '';
  const { admin, userId, workspace } = ctx;
  try {
    const circle = await one(admin.from('community_circles')
      .select('id,owner_user_id,workspace_tenant_id,status,capacity,name')
      .eq('id', circleId));
    if (!circle || circle.status !== 'active' || (circle.workspace_tenant_id || null) !== (workspace.tenantId || null)) {
      return failure(req, ctx, 'not_found', 404);
    }
    const membership = await one(admin.from('community_circle_members')
      .select('circle_id,user_id,role,status').eq('circle_id', circleId).eq('user_id', userId));
    const permission = readingAccess(circle, membership, workspace, userId);
    if (!permission.allowed) return failure(req, ctx, permission.error || 'forbidden', permission.status);

    if (req.method === 'GET' && !tail) {
      return ctx.json(req, { circle: { id: circle.id, name: circle.name },
        membership: { role: membership.role, status: membership.status }, can_manage: permission.manager });
    }

    if (req.method === 'GET' && tail === 'meetings') {
      const meetings = await many(admin.from('community_reading_meetings')
        .select('id,circle_id,title,book_title,starts_at,status,summary,created_at')
        .eq('circle_id', circleId).order('starts_at', { ascending: false, nullsFirst: false }).limit(50));
      return ctx.json(req, { meetings, can_manage: permission.manager });
    }

    if (req.method === 'POST' && tail === 'meetings') {
      if (!permission.manager) return failure(req, ctx, 'manager_required', 403);
      const body = await req.json().catch(() => ({}));
      const title = short(body.title, 160);
      const starts = readingDate(body.starts_at);
      if (title.length < 2 || starts === undefined) return failure(req, ctx, 'invalid_meeting');
      const row = { circle_id: circleId, created_by: userId, title,
        book_title: short(body.book_title, 160), summary: short(body.summary, 1000),
        starts_at: starts, status: 'planned' };
      const { data, error } = await admin.from('community_reading_meetings').insert(row)
        .select('id,circle_id,title,book_title,starts_at,status,summary,created_at').single();
      if (error) throw error;
      await audit(admin, circleId, userId, 'meeting.created', data.id);
      return ctx.json(req, { meeting: data }, 201);
    }

    if (req.method === 'GET' && tail === 'members') {
      if (!permission.manager) return failure(req, ctx, 'manager_required', 403);
      const members = await many(admin.from('community_circle_members')
        .select('circle_id,user_id,role,status,created_at').eq('circle_id', circleId)
        .in('status', ['pending', 'active']).order('created_at', { ascending: true }).limit(100));
      // Only authorized managers see pending names. No email, phone or join-note projection.
      const users = members.map((m: any) => m.user_id);
      const profiles = users.length ? await many(admin.from('community_profiles')
        .select('user_id,display_name').in('user_id', users)) : [];
      const labels = new Map(profiles.map((p: any) => [p.user_id, short(p.display_name, 80)]));
      return ctx.json(req, { members: members.map((m: any) =>
        ({ ...m, display_name: labels.get(m.user_id) || '' })) });
    }

    const review = tail.match(/^members\/([0-9a-f-]{36})\/decision$/i);
    if (req.method === 'POST' && review && READING_UUID.test(review[1])) {
      if (!permission.manager) return failure(req, ctx, 'manager_required', 403);
      const body = await req.json().catch(() => ({}));
      if (!['approve', 'decline'].includes(body.decision)) return failure(req, ctx, 'invalid_decision');
      // This server-only RPC locks the circle for capacity-safe concurrent approvals.
      const { data, error } = await admin.rpc('community_reading_review_member', {
        p_circle_id: circleId, p_actor_id: userId, p_target_id: review[1], p_decision: body.decision,
      });
      if (error) {
        if (error.code === 'P0001') return failure(req, ctx, 'review_not_allowed', 409);
        throw error;
      }
      if (!data?.ok) return failure(req, ctx, data?.error || 'review_not_allowed', 409);
      return ctx.json(req, { membership: { user_id: review[1], status: data.status } });
    }

    const meeting = tail.match(/^meetings\/([0-9a-f-]{36})(?:\/(.*))?$/i);
    if (meeting && READING_UUID.test(meeting[1])) {
      const meetingId = meeting[1];
      const suffix = meeting[2] || '';
      const record = await one(admin.from('community_reading_meetings')
        .select('id,circle_id,status').eq('circle_id', circleId).eq('id', meetingId));
      if (!record) return failure(req, ctx, 'not_found', 404);

      if (req.method === 'POST' && suffix === 'status') {
        if (!permission.manager) return failure(req, ctx, 'manager_required', 403);
        const body = await req.json().catch(() => ({}));
        if (!['planned', 'done', 'cancelled'].includes(body.status)) return failure(req, ctx, 'invalid_status');
        const { error } = await admin.from('community_reading_meetings')
          .update({ status: body.status, updated_at: new Date().toISOString() })
          .eq('id', meetingId).eq('circle_id', circleId);
        if (error) throw error;
        await audit(admin, circleId, userId, 'meeting.status', meetingId);
        return ctx.json(req, { status: body.status });
      }

      if (req.method === 'GET' && suffix === 'entries') {
        const entries = await many(admin.from('community_reading_entries')
          .select('id,circle_id,meeting_id,parent_id,author_user_id,kind,scope,content,created_at,updated_at')
          .eq('circle_id', circleId).eq('meeting_id', meetingId).is('deleted_at', null)
          .or('scope.eq.circle,author_user_id.eq.' + userId)
          .order('created_at', { ascending: true }).limit(150));
        return ctx.json(req, { entries });
      }

      if (req.method === 'POST' && suffix === 'entries') {
        if (record.status === 'cancelled') return failure(req, ctx, 'meeting_cancelled', 409);
        const input = readingInput(await req.json().catch(() => ({})));
        if (input.error) return failure(req, ctx, input.error);
        let scope = input.scope;
        if (input.parentId) {
          const parent = await one(admin.from('community_reading_entries')
            .select('id,meeting_id,circle_id,scope,author_user_id,deleted_at').eq('id', input.parentId)
            .eq('meeting_id', meetingId).eq('circle_id', circleId));
          if (!readingVisible(parent, userId)) return failure(req, ctx, 'parent_not_found', 404);
          // A reply cannot accidentally reveal or silently change a private parent.
          scope = parent.scope;
        }
        const { data, error } = await admin.from('community_reading_entries').insert({
          circle_id: circleId, meeting_id: meetingId, parent_id: input.parentId,
          author_user_id: userId, kind: input.kind, scope, content: input.content,
        }).select('id,circle_id,meeting_id,parent_id,author_user_id,kind,scope,content,created_at,updated_at').single();
        if (error) throw error;
        await audit(admin, circleId, userId, 'entry.created', data.id);
        return ctx.json(req, { entry: data }, 201);
      }

      if (req.method === 'GET' && suffix === 'attendance') {
        const query = admin.from('community_reading_attendance')
          .select('meeting_id,user_id,status,updated_at').eq('circle_id', circleId).eq('meeting_id', meetingId);
        const attendance = await many((permission.manager ? query : query.eq('user_id', userId)).limit(150));
        return ctx.json(req, { attendance, can_manage: permission.manager });
      }

      if (req.method === 'POST' && suffix === 'attendance') {
        if (!permission.manager) return failure(req, ctx, 'manager_required', 403);
        const body = await req.json().catch(() => ({}));
        if (!READING_UUID.test(String(body.user_id || '')) || !['present', 'absent', 'excused'].includes(body.status)) return failure(req, ctx, 'invalid_attendance');
        const target = await one(admin.from('community_circle_members')
          .select('user_id').eq('circle_id', circleId).eq('user_id', body.user_id).eq('status', 'active'));
        if (!target) return failure(req, ctx, 'member_not_active', 409);
        const { error } = await admin.from('community_reading_attendance').upsert({
          meeting_id: meetingId, circle_id: circleId, user_id: body.user_id, status: body.status,
          set_by: userId, updated_at: new Date().toISOString(),
        }, { onConflict: 'meeting_id,user_id' });
        if (error) throw error;
        await audit(admin, circleId, userId, 'attendance.updated', meetingId);
        return ctx.json(req, { ok: true });
      }
    }

    const entryAction = tail.match(/^entries\/([0-9a-f-]{36})\/(update|delete)$/i);
    if (req.method === 'POST' && entryAction && READING_UUID.test(entryAction[1])) {
      const existing = await one(admin.from('community_reading_entries')
        .select('id,author_user_id,circle_id,meeting_id,scope,kind,parent_id,deleted_at')
        .eq('id', entryAction[1]).eq('circle_id', circleId));
      if (!existing || existing.deleted_at || existing.author_user_id !== userId) return failure(req, ctx, 'not_found', 404);
      if (entryAction[2] === 'delete') {
        const { error } = await admin.from('community_reading_entries')
          .update({ deleted_at: new Date().toISOString(), content: '', updated_at: new Date().toISOString() })
          .eq('id', existing.id).eq('circle_id', circleId).eq('author_user_id', userId).is('deleted_at', null);
        if (error) throw error;
        await audit(admin, circleId, userId, 'entry.deleted', existing.id);
        return ctx.json(req, { ok: true });
      }
      const body = await req.json().catch(() => ({}));
      const content = String(body.content || '').trim();
      if (!content || content.length > 2500) return failure(req, ctx, 'content_length');
      const scope = body.scope === undefined ? existing.scope : String(body.scope);
      if (!['private', 'circle'].includes(scope)) return failure(req, ctx, 'invalid_scope');
      if (existing.parent_id && scope !== existing.scope) return failure(req, ctx, 'reply_scope_locked');
      if (existing.scope === 'private' && scope === 'circle' && body.share_to_circle !== true)
        return failure(req, ctx, 'explicit_share_required');
      const { error } = await admin.from('community_reading_entries')
        .update({ content, scope, updated_at: new Date().toISOString() })
        .eq('id', existing.id).eq('circle_id', circleId).eq('author_user_id', userId).is('deleted_at', null);
      if (error) throw error;
      await audit(admin, circleId, userId, 'entry.updated', existing.id);
      return ctx.json(req, { ok: true });
    }

    return failure(req, ctx, 'not_found', 404);
  } catch (error) {
    const code = readingError(error);
    console.error('community-reading-api', error);
    return failure(req, ctx, code, code === 'reading_not_ready' ? 503 : 500);
  }
}
