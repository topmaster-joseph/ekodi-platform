-- EKODI development environment identity.
-- This file is intentionally development-only and contains no production project reference.
create schema if not exists ekodi_internal;
revoke all on schema ekodi_internal from public;
revoke all on schema ekodi_internal from anon, authenticated;

create table if not exists ekodi_internal.environment_identity (
  singleton boolean primary key default true check (singleton),
  environment text not null check (environment in ('development','production')),
  logical_name text not null,
  project_ref text not null unique,
  updated_at timestamptz not null default now()
);

revoke all on table ekodi_internal.environment_identity from public;
revoke all on table ekodi_internal.environment_identity from anon, authenticated;

insert into ekodi_internal.environment_identity(singleton, environment, logical_name, project_ref)
values (true, 'development', 'ekodi-dev', 'lxcxwbdwwojjkgybbqii')
on conflict (singleton) do update
set environment = excluded.environment,
    logical_name = excluded.logical_name,
    project_ref = excluded.project_ref,
    updated_at = now();
