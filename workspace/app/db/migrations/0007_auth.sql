-- Forward-only. Authentication state (D-011, D-029). Identities and sessions live in schema auth, which the application role cannot read or write
-- directly: it can only call the SECURITY DEFINER functions below. The tables still carry tenant_id and forced row-level security (default deny,
-- visible only to the owner role, which is what the definer functions run as).
alter table users add column disabled_at timestamptz;

create schema auth authorization uw_owner;
revoke all on schema auth from public;
grant usage on schema auth to uw_app;

create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null,
  issuer text not null check (issuer ~ '^https?://'),
  subject text not null check (length(subject) between 1 and 255),
  created_at timestamptz not null default now(),
  unique (issuer, subject),
  unique (tenant_id, user_id, issuer),
  foreign key (tenant_id, user_id) references public.users (tenant_id, id)
);

create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid not null,
  token_hash bytea not null unique check (length(token_hash) = 32),   -- sha256 of the random token; the token itself is never stored
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,                                     -- absolute lifetime
  revoked_at timestamptz,
  foreign key (tenant_id, user_id) references public.users (tenant_id, id)
);
create index on auth.sessions (tenant_id, user_id);

alter table auth.identities enable row level security;
alter table auth.identities force row level security;
create policy owner_only on auth.identities using (current_user = 'uw_owner') with check (current_user = 'uw_owner');
alter table auth.sessions enable row level security;
alter table auth.sessions force row level security;
create policy owner_only on auth.sessions using (current_user = 'uw_owner') with check (current_user = 'uw_owner');

-- Reads a user's role and state under that user's tenant, then restores the caller's tenant setting (transaction-local settings must not leak).
create function auth.user_state(p_tenant uuid, p_user uuid, out o_role text, out o_disabled boolean) language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_prev text := current_setting('app.tenant_id', true);
begin
  perform set_config('app.tenant_id', p_tenant::text, true);
  select u.role, u.disabled_at is not null into o_role, o_disabled from public.users u where u.id = p_user and u.tenant_id = p_tenant;
  perform set_config('app.tenant_id', coalesce(v_prev, ''), true);
end $$;

-- Creates a session for a known, enabled identity. Returns no row when the identity is unknown or its user is disabled.
create function auth.login(p_issuer text, p_subject text, p_token_hash bytea, p_absolute interval)
returns table (session_id uuid, tenant_id uuid, user_id uuid, role text) language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare i auth.identities%rowtype; st record; sid uuid;
begin
  select * into i from auth.identities where issuer = p_issuer and subject = p_subject;
  if not found then return; end if;
  select * into st from auth.user_state(i.tenant_id, i.user_id);
  if st.o_role is null or st.o_disabled then return; end if;
  if p_absolute <= interval '0' or p_absolute > interval '30 days' then raise exception 'invalid session lifetime'; end if;
  insert into auth.sessions (tenant_id, user_id, token_hash, expires_at) values (i.tenant_id, i.user_id, p_token_hash, now() + p_absolute) returning id into sid;
  return query select sid, i.tenant_id, i.user_id, st.o_role;
end $$;

-- Resolves a session token hash. Enforces revocation, absolute lifetime, inactivity timeout and user state on every call.
create function auth.resolve_session(p_token_hash bytea, p_idle interval)
returns table (session_id uuid, tenant_id uuid, user_id uuid, role text) language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare s auth.sessions%rowtype; st record;
begin
  select * into s from auth.sessions where token_hash = p_token_hash and revoked_at is null and expires_at > now() and last_seen_at > now() - p_idle;
  if not found then return; end if;
  select * into st from auth.user_state(s.tenant_id, s.user_id);
  if st.o_role is null or st.o_disabled then
    update auth.sessions set revoked_at = now() where id = s.id;
    return;
  end if;
  if s.last_seen_at < now() - interval '60 seconds' then update auth.sessions set last_seen_at = now() where id = s.id; end if;
  return query select s.id, s.tenant_id, s.user_id, st.o_role;
end $$;

create function auth.logout(p_token_hash bytea) returns void language sql security definer set search_path = pg_catalog, auth as $$
  update auth.sessions set revoked_at = now() where token_hash = p_token_hash and revoked_at is null
$$;

-- Tenant-context functions: the actor and tenant come from the transaction settings set by the application after it verified the session.
create function auth.actor_role() returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare r text;
begin
  select u.role into r from public.users u where u.id = app_user_id() and u.tenant_id = app_tenant_id() and u.disabled_at is null;
  return r;
end $$;

create function auth.revoke_user_sessions(p_user uuid) returns int language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare n int;
begin
  if app_tenant_id() is null or app_user_id() is null then raise exception 'no actor' using errcode = '42501'; end if;
  if p_user <> app_user_id() and coalesce(auth.actor_role(), '') <> 'admin' then raise exception 'only an admin may revoke another user''s sessions' using errcode = '42501'; end if;
  update auth.sessions set revoked_at = now() where tenant_id = app_tenant_id() and user_id = p_user and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function auth.link_identity(p_user uuid, p_issuer text, p_subject text) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if coalesce(auth.actor_role(), '') <> 'admin' then raise exception 'only an admin may link identities' using errcode = '42501'; end if;
  if not exists (select 1 from public.users where id = p_user and tenant_id = app_tenant_id()) then raise exception 'unknown user' using errcode = '42501'; end if;
  insert into auth.identities (tenant_id, user_id, issuer, subject) values (app_tenant_id(), p_user, p_issuer, p_subject);
end $$;

create function auth.set_user_disabled(p_user uuid, p_disabled boolean) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if coalesce(auth.actor_role(), '') <> 'admin' then raise exception 'only an admin may disable users' using errcode = '42501'; end if;
  if p_user = app_user_id() then raise exception 'an admin may not disable themselves' using errcode = '42501'; end if;
  update public.users set disabled_at = case when p_disabled then now() else null end where id = p_user and tenant_id = app_tenant_id();
  if p_disabled then update auth.sessions set revoked_at = now() where tenant_id = app_tenant_id() and user_id = p_user and revoked_at is null; end if;
end $$;

revoke all on function auth.user_state(uuid, uuid), auth.login(text, text, bytea, interval), auth.resolve_session(bytea, interval), auth.logout(bytea),
  auth.actor_role(), auth.revoke_user_sessions(uuid), auth.link_identity(uuid, text, text), auth.set_user_disabled(uuid, boolean) from public;
grant execute on function auth.login(text, text, bytea, interval), auth.resolve_session(bytea, interval), auth.logout(bytea),
  auth.revoke_user_sessions(uuid), auth.link_identity(uuid, text, text), auth.set_user_disabled(uuid, boolean) to uw_app;
-- auth.user_state and auth.actor_role stay internal to the definer functions (not granted to uw_app).
