-- Forward-only. Applications (borrower-submitted data) and exceptions raised by ingestion/rules.
create table applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  legal_name text not null check (length(legal_name) > 0),
  entity_type text not null check (entity_type in ('sole_proprietorship','partnership','llc','s_corp','c_corp','nonprofit','other')),
  ein_last4 text not null check (ein_last4 ~ '^[0-9]{4}$'),
  ein_ciphertext bytea not null,                 -- application-level encryption, per-tenant key
  naics text not null check (naics ~ '^[0-9]{6}$'),
  years_in_business int not null check (years_in_business >= 0),
  loan_amount_cents bigint not null check (loan_amount_cents > 0),
  purposes text[] not null check (cardinality(purposes) > 0),
  owners jsonb not null,
  submitted_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  unique (tenant_id, case_id)
);
alter table applications enable row level security;
alter table applications force row level security;
create policy applications_isolation on applications using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert on applications to uw_app;

create table exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  document_id uuid,
  kind text not null check (length(kind) > 0),
  severity text not null check (severity in ('critical','high','medium','low')),
  detail text not null,
  source jsonb not null default '{}',
  status text not null default 'open' check (status in ('open','disposed')),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  foreign key (tenant_id, document_id) references documents(tenant_id, id)
);
alter table exceptions enable row level security;
alter table exceptions force row level security;
create policy exceptions_isolation on exceptions using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert on exceptions to uw_app;

-- one fact per key per document: ingestion is idempotent
create unique index facts_doc_key_uniq on facts (tenant_id, doc_id, key);
