-- EKODI Points recognition goals: read-only performance hardening.
-- The primary key (site_id,person_id) covers site-scoped lookup; the
-- separate People foreign key needs a person_id-leading index for deletes
-- and future per-Person audit/cleanup. No grants, RLS or ledger changes.
create index if not exists ekodi_point_recognition_goals_person_idx
  on ekodi_points_private.member_recognition_goals (person_id);
