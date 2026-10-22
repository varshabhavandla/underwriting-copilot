-- Requested term (for maturity rules), rule evaluation results, and drafted memos. Forward-only.
alter table applications add column requested_term_months int check (requested_term_months between 1 and 360);

create table rule_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  pack text not null,
  pack_version text not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  unique (tenant_id, id)
);
alter table rule_runs enable row level security;
alter table rule_runs force row level security;
create policy rule_runs_isolation on rule_runs using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create trigger rule_runs_append_only before update or delete on rule_runs for each row execute function forbid_change();

create table rule_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  run_id uuid not null,
  case_id uuid not null,
  rule_id text not null,
  sop_section text not null check (length(sop_section) > 0),
  outcome text not null check (outcome in ('pass','fail','needs_review','not_applicable')),
  detail text not null,
  inputs jsonb not null default '{}',
  fact_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, run_id) references rule_runs(tenant_id, id)
);
alter table rule_results enable row level security;
alter table rule_results force row level security;
create policy rule_results_isolation on rule_results using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create trigger rule_results_append_only before update or delete on rule_results for each row execute function forbid_change();

-- memo drafts: every line carries citations; adoption by an underwriter is a separate, later step
create table memos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  run_id uuid not null,
  sections jsonb not null,
  drafted_by text not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  foreign key (tenant_id, run_id) references rule_runs(tenant_id, id)
);
alter table memos enable row level security;
alter table memos force row level security;
create policy memos_isolation on memos using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create trigger memos_append_only before update or delete on memos for each row execute function forbid_change();

grant select, insert on rule_runs, rule_results, memos to uw_app;
