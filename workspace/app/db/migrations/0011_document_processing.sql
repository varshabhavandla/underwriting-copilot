-- Forward-only. Processing state of each uploaded document, so the console can show progress live (D-039). The documents table stays insert-only; the
-- state lives here. Lender isolation is forced like every other table. A document with no row here (uploaded before this migration) counts as done.
create table document_processing (
  tenant_id uuid not null references tenants(id),
  document_id uuid not null,
  case_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  -- a short, generic reason. Never document text, never an identifier.
  error text check (error is null or length(error) <= 200),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  primary key (tenant_id, document_id),
  foreign key (tenant_id, document_id) references documents(tenant_id, id),
  foreign key (tenant_id, case_id) references cases(tenant_id, id)
);
alter table document_processing enable row level security;
alter table document_processing force row level security;
create policy document_processing_isolation on document_processing using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

-- Only these moves are possible: queued -> processing -> done | failed, a failed or stalled document may be queued again, and done is final.
create function document_processing_guard() returns trigger language plpgsql as $$
begin
  if new.tenant_id is distinct from old.tenant_id or new.document_id is distinct from old.document_id
     or new.case_id is distinct from old.case_id or new.queued_at is distinct from old.queued_at then
    raise exception 'document_processing: identity columns are immutable' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and (old.status, new.status) not in (('queued', 'processing'), ('processing', 'done'), ('processing', 'failed'), ('processing', 'queued'), ('failed', 'queued')) then
    raise exception 'document_processing: % -> % is not allowed', old.status, new.status using errcode = '42501';
  end if;
  return new;
end $$;
create trigger document_processing_guard_trg before update on document_processing for each row execute function document_processing_guard();
grant select, insert, update on document_processing to uw_app;
