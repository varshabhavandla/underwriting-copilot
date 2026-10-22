-- Forward-only. Per-tenant single sign-on (B-152): each lender can use its own identity provider. The operator provisions a row with a slug (the
-- organization name people type at sign-in); the tenant's admin then fills in the provider details. The client secret is encrypted by the
-- application under the tenant's key and is never returned by any function. Like the other auth tables, this one is reachable by the
-- application role only through the functions below.
create table auth.tenant_idps (
  tenant_id uuid primary key references tenants(id),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  issuer text unique check (issuer ~ '^https?://[^[:space:]]+$' and length(issuer) <= 300),
  client_id text check (length(client_id) between 1 and 255),
  client_secret_enc bytea,
  required_amr text[] not null default '{}' check (cardinality(required_amr) <= 5),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (not enabled or (issuer is not null and client_id is not null and client_secret_enc is not null))
);
alter table auth.tenant_idps enable row level security;
alter table auth.tenant_idps force row level security;
create policy owner_only on auth.tenant_idps using (current_user = 'uw_owner') with check (current_user = 'uw_owner');

-- Before anyone is signed in: which provider does this organization use? Only enabled, fully configured rows answer.
create function auth.idp_for_slug(p_slug text) returns table (tenant_id uuid, issuer text, client_id text, client_secret_enc bytea, required_amr text[])
language sql security definer set search_path = pg_catalog, auth as $$
  select t.tenant_id, t.issuer, t.client_id, t.client_secret_enc, t.required_amr from auth.tenant_idps t where t.slug = lower(p_slug) and t.enabled
$$;

create function auth.get_my_idp() returns table (slug text, issuer text, client_id text, has_secret boolean, required_amr text[], enabled boolean)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  perform auth.require_admin();
  return query select t.slug, t.issuer, t.client_id, t.client_secret_enc is not null, t.required_amr, t.enabled from auth.tenant_idps t where t.tenant_id = app_tenant_id();
end $$;

-- p_secret_enc null keeps the stored secret. The row must already exist: the operator provisions the organization name, so an admin cannot claim another's.
create function auth.configure_idp(p_issuer text, p_client_id text, p_secret_enc bytea, p_amr text[], p_enabled boolean) returns void
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_old text;
begin
  perform auth.require_admin();
  select issuer into v_old from auth.tenant_idps where tenant_id = app_tenant_id();
  if not found then raise exception 'single sign-on has not been provisioned for this organization' using errcode = '42501'; end if;
  if p_issuer !~ '^https?://[^[:space:]]+$' or length(p_issuer) > 300 then raise exception 'invalid issuer URL' using errcode = '22023'; end if;
  if coalesce(length(p_client_id), 0) not between 1 and 255 then raise exception 'invalid client id' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_amr, '{}')) a where a !~ '^[a-z0-9_-]{1,30}$') then raise exception 'invalid authentication method name' using errcode = '22023'; end if;
  update auth.tenant_idps set issuer = p_issuer, client_id = p_client_id, client_secret_enc = coalesce(p_secret_enc, client_secret_enc),
         required_amr = coalesce(p_amr, '{}'), enabled = p_enabled, updated_at = now(), updated_by = app_user_id() where tenant_id = app_tenant_id();
  perform auth.audit_event('admin.idp_configured', jsonb_build_object('enabled', p_enabled, 'issuerChanged', v_old is distinct from p_issuer, 'secretChanged', p_secret_enc is not null));
end $$;

-- identities must belong to this organization's own provider once one is configured
create or replace function auth.link_identity(p_user uuid, p_issuer text, p_subject text) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_issuer text;
begin
  perform auth.require_admin();
  if not exists (select 1 from public.users where id = p_user and tenant_id = app_tenant_id()) then raise exception 'unknown user' using errcode = '42501'; end if;
  select issuer into v_issuer from auth.tenant_idps where tenant_id = app_tenant_id();
  if v_issuer is not null and p_issuer <> v_issuer then raise exception 'identities must come from this organization''s configured identity provider' using errcode = '42501'; end if;
  insert into auth.identities (tenant_id, user_id, issuer, subject) values (app_tenant_id(), p_user, p_issuer, p_subject);
  perform auth.audit_event('admin.identity_linked', jsonb_build_object('userId', p_user));
end $$;

-- sign-in started for a specific organization can only produce a session in that organization
drop function auth.login(text, text, bytea, interval, text);
create function auth.login(p_issuer text, p_subject text, p_token_hash bytea, p_absolute interval, p_user_agent text default null, p_tenant uuid default null)
returns table (session_id uuid, tenant_id uuid, user_id uuid, role text) language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare i auth.identities%rowtype; st record; sid uuid;
begin
  select * into i from auth.identities where issuer = p_issuer and subject = p_subject;
  if not found then return; end if;
  if p_tenant is not null and i.tenant_id <> p_tenant then return; end if;
  select * into st from auth.user_state(i.tenant_id, i.user_id);
  if st.o_role is null or st.o_disabled then return; end if;
  if p_absolute <= interval '0' or p_absolute > interval '30 days' then raise exception 'invalid session lifetime'; end if;
  insert into auth.sessions (tenant_id, user_id, token_hash, expires_at, user_agent)
  values (i.tenant_id, i.user_id, p_token_hash, now() + p_absolute, left(p_user_agent, 160)) returning id into sid;
  return query select sid, i.tenant_id, i.user_id, st.o_role;
end $$;

revoke all on function auth.idp_for_slug(text), auth.get_my_idp(), auth.configure_idp(text, text, bytea, text[], boolean), auth.login(text, text, bytea, interval, text, uuid) from public;
grant execute on function auth.idp_for_slug(text), auth.get_my_idp(), auth.configure_idp(text, text, bytea, text[], boolean), auth.login(text, text, bytea, interval, text, uuid) to uw_app;
