begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'people', 'canonical people table exists');
select has_table('public', 'login_identities', 'verified login identities table exists');
select has_column('public', 'login_identities', 'person_id', 'identity links to person');
select has_column('public', 'login_identities', 'provider_subject', 'provider subject is stored separately from email');
select has_column('public', 'identity_challenges', 'purpose', 'identity challenge has purpose');
select has_column('public', 'identity_challenges', 'initiator_user_id', 'identity challenge records linking initiator');

select has_function(
  'public',
  'ensure_person_identity',
  array['uuid','text','text','text','text'],
  'person bootstrap function exists'
);
select has_function(
  'public',
  'link_person_identity',
  array['uuid','uuid','text','text','text','text'],
  'explicit account linking function exists'
);
select has_function(
  'public',
  'sync_person_access',
  array['uuid'],
  'person membership synchronization function exists'
);
select has_function(
  'public',
  'current_site_workspaces',
  array['text'],
  'workspace resolver exists'
);
select has_function(
  'public',
  'current_site_access',
  array['text'],
  'legacy single-access compatibility resolver exists'
);

select ok(
  exists(
    select 1
      from pg_constraint
     where conrelid = 'public.login_identities'::regclass
       and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%provider%provider_subject%'
  ),
  'provider + provider_subject is unique independently of email'
);

select * from finish();
rollback;
