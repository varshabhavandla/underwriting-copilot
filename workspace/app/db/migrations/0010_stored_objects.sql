-- Forward-only. Database-backed object storage for test deployments and small pilots (hosts with no writable disk, such as Vercel). Bytes are encrypted by
-- the application under the tenant's key before they get here; rows are written once and never changed. A managed bucket replaces this in production (B-126).
create table stored_objects (
  tenant_id uuid not null references tenants(id),
  key text not null check (length(key) between 40 and 200),
  ciphertext bytea not null check (length(ciphertext) <= 5242880),
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
alter table stored_objects enable row level security;
alter table stored_objects force row level security;
create policy stored_objects_isolation on stored_objects using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create trigger stored_objects_append_only before update or delete on stored_objects for each row execute function forbid_change();
grant select, insert on stored_objects to uw_app;
