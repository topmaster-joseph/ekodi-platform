-- Distinct EKODI Singles finance authorities. Keep approvals scoped: access to
-- the ledger does not permit changing bank destination, pricing, or verification.
alter table public.singles_bank_operators
 add column if not exists can_verify boolean not null default false;
alter table public.singles_bank_operators
 add column if not exists can_configure boolean not null default false;
comment on column public.singles_bank_operators.can_verify is
 'Manual bank statement verification capability assigned by EKODI Core.';
comment on column public.singles_bank_operators.can_configure is
 'Bank account and fixed pricing editing capability, distinct from receipt verification.';
