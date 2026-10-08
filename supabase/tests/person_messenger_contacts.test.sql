begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('private','person_messenger_contacts','private messenger fact ledger exists');
select has_table('private','person_share_context_messengers','share-context messenger relation exists');
select has_function(
  'public','set_my_identity_share_config_v2',
  array['text','text','boolean','jsonb','jsonb','jsonb'],
  'authenticated v2 identity setter exists'
);
select has_function(
  'public','person_identity_share_capabilities',
  array[]::text[],
  'public capability probe exists'
);
select ok(
  not has_table_privilege('anon','private.person_messenger_contacts','SELECT'),
  'anonymous callers cannot read private messenger facts directly'
);
select ok(
  not has_table_privilege('authenticated','private.person_messenger_contacts','SELECT'),
  'authenticated callers cannot read private messenger facts directly'
);
select ok(
  not has_function_privilege('anon','public.set_my_identity_share_config_v2(text,text,boolean,jsonb,jsonb,jsonb)','EXECUTE'),
  'anonymous callers cannot mutate messenger facts'
);
select ok(
  has_function_privilege('authenticated','public.set_my_identity_share_config_v2(text,text,boolean,jsonb,jsonb,jsonb)','EXECUTE'),
  'authenticated callers can use the scoped messenger setter'
);
select ok(
  has_function_privilege('anon','public.person_identity_share(text,text)','EXECUTE'),
  'anonymous callers can access the bounded public projection'
);

insert into public.people(id,display_name,status)
values('11111111-1111-4111-8111-111111111111'::uuid,'Messenger Proof','active');

insert into public.person_public_profiles(
  person_id,handle,display_name,headline,bio,links,visibility
) values(
  '11111111-1111-4111-8111-111111111111'::uuid,
  'messenger-proof-fixture',
  'Messenger Proof',
  'Fixture only',
  '',
  '[]'::jsonb,
  'public'
);

insert into private.person_digital_cards(
  person_id,phone,email,phone_public,email_public,exchange_enabled,affiliations
) values(
  '11111111-1111-4111-8111-111111111111'::uuid,
  '','','false','false',true,'[]'::jsonb
);

insert into private.person_share_contexts(
  id,person_id,context_key,label,role_id,
  show_phone,show_email,show_profile_intro,show_profile_links,
  exchange_enabled,visibility,is_default,sort_order
) values
(
  '22222222-2222-4222-8222-222222222221'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'ekodi','EKODI',null,false,false,true,false,true,'public',true,1
),
(
  '22222222-2222-4222-8222-222222222222'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'personal','개인',null,false,false,true,false,true,'public',false,2
);

insert into private.person_messenger_contacts(
  id,person_id,contact_key,service,label,value,url,enabled,sort_order
) values
(
  '33333333-3333-4333-8333-333333333331'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'telegram-work','telegram','Telegram','fixture_telegram_123','',true,1
),
(
  '33333333-3333-4333-8333-333333333332'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'wechat-personal','wechat','WeChat','fixture_wechat_456','',true,2
);

insert into private.person_share_context_messengers(
  person_id,context_id,messenger_id,sort_order
) values
(
  '11111111-1111-4111-8111-111111111111'::uuid,
  '22222222-2222-4222-8222-222222222221'::uuid,
  '33333333-3333-4333-8333-333333333331'::uuid,
  1
),
(
  '11111111-1111-4111-8111-111111111111'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  '33333333-3333-4333-8333-333333333332'::uuid,
  1
);

select is(
  jsonb_array_length(public.person_identity_share('messenger-proof-fixture','ekodi')->'messengers'),
  1,
  'EKODI context exposes exactly one selected messenger'
);
select is(
  public.person_identity_share('messenger-proof-fixture','ekodi')->'messengers'->0->>'service',
  'telegram',
  'EKODI context exposes Telegram'
);
select ok(
  position('fixture_wechat_456' in public.person_identity_share('messenger-proof-fixture','ekodi')::text)=0,
  'EKODI context does not leak the personal WeChat ID'
);
select is(
  public.person_identity_share('messenger-proof-fixture','personal')->'messengers'->0->>'service',
  'wechat',
  'personal context exposes WeChat'
);
select ok(
  position('fixture_telegram_123' in public.person_identity_share('messenger-proof-fixture','personal')::text)=0,
  'personal context does not leak the EKODI Telegram ID'
);
select ok(
  (public.person_identity_share_capabilities()->>'messenger_contacts')::boolean,
  'capability probe reports messenger sharing'
);

select * from finish();
rollback;
