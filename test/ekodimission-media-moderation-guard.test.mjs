import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const link=read('20261012060200_activity_media_moderation_guard.sql');
const reserve=read('20261012060300_activity_photo_reservation_moderation_guard.sql');
const finalize=read('20261012060400_activity_photo_finalize_moderation_guard.sql');

test('canonical link collision does not reverse operator hide',()=>{
  assert.match(link,/on conflict\(activity_id,canonical_url\) do update set[\s\S]*?where public\.activity_media_links\.hidden_at is null/);
  assert.match(link,/if v_id is null then\s*return jsonb_build_object\('ok',false,'error','media_moderated'\)/);
  assert.doesNotMatch(link,/hidden_at\s*=\s*null/);
});

test('duplicate photo re-reservation blocks moderation, including update races',()=>{
  assert.equal((reserve.match(/v_existing\.hidden_at is not null/g)||[]).length,2);
  assert.match(reserve,/where id=v_existing\.id and hidden_at is null/);
  assert.match(reserve,/if not found then\s*return jsonb_build_object\('ok',false,'error','media_moderated'\)/);
  assert.doesNotMatch(reserve,/hidden_at\s*=\s*null|hidden_by\s*=\s*null/);
});

test('photo finalization is not allowed for moderated uploading media',()=>{
  assert.match(finalize,/and upload_token=coalesce\(p_upload_token,''\) and hidden_at is null/);
});

test('reviewed public privileged RPC grants are explicit',()=>{
  for(const [sql,name] of [
    [link,'activity_public_submit_media_link'],
    [reserve,'activity_public_reserve_media_upload'],
    [finalize,'activity_public_finalize_media_upload']
  ]){
    assert.ok(sql.includes('revoke all on function public.'+name+'('));
    assert.ok(sql.includes('grant execute on function public.'+name+'('));
    assert.ok(sql.includes('comment on function public.'+name+'('));
  }
  for(const name of ['activity_public_fail_media_upload','activity_public_media_file_ref','activity_public_registration_status']){
    assert.ok(finalize.includes('comment on function public.'+name+'('));
  }
});

test('moderation deployment is orchestrator-authorized and never replays vulnerable RPC definitions',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/deploy-activity-public-share-schema.yml',import.meta.url),'utf8');
  const paths=[
    '20261012060200_activity_media_moderation_guard.sql',
    '20261012060300_activity_photo_reservation_moderation_guard.sql',
    '20261012060400_activity_photo_finalize_moderation_guard.sql'
  ];
  for(const path of paths)assert.ok(workflow.includes(path),'Deployment must register '+path);
  assert.match(workflow,/github.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/release_task_id:/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release-receipt/);
  assert.match(workflow,/\.authorized == true/);
  assert.match(workflow,/for migration in "\$LINK_GUARD_MIGRATION" "\$RESERVE_GUARD_MIGRATION" "\$FINALIZE_GUARD_MIGRATION"/);
  assert.doesNotMatch(workflow,/for migration in "\$BASE_MIGRATION" "\$PRIVACY_GUARD_MIGRATION"/);
  assert.match(workflow,/credential unavailable: failing closed/);
  assert.doesNotMatch(workflow,/switching to live-schema verification fallback/i,'credentialless public checks cannot attest production moderation');
  assert.match(workflow,/Verify that security guards are installed in production/);
});

test('protected merge reconciler only dispatches reviewed guards after official release receipt and matching main blobs',()=>{
  const runner=readFileSync(new URL('../.github/workflows/reconcile-mission-media-moderation-release.yml',import.meta.url),'utf8');
  assert.match(runner,/release-receipt/);
  assert.match(runner,/\.authorized == true/);
  assert.match(runner,/merged_at/);
  assert.match(runner,/cancel-in-progress: false/,'post-merge guard dispatcher may not cancel a verified release');
  assert.match(runner,/No verified protected merge within lease/,'missing protected merge must fail closed rather than deploy');
  assert.match(runner,/if \[ -n "\$merged_at" \]/);
  assert.match(runner,/source_sha/);
  assert.match(runner,/main_sha/);
  assert.match(runner,/\[ "\$source_sha" = "\$main_sha" \]/);
  assert.match(runner,/deploy-activity-public-share-schema.yml\/dispatches/);
  assert.match(runner,/ref:"main"/);
  assert.doesNotMatch(runner,/supabase\.com\/v1\/projects\/.*\/database\/query/);
});

test('security-only migrations never drop or truncate persistent activity data',()=>{
  for(const sql of [link,reserve,finalize]){
    assert.doesNotMatch(sql,/\bdrop\s+table\b|\btruncate\s+table\b/i);
  }
});
