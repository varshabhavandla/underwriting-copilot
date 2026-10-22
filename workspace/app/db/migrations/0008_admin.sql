-- Forward-only. Administration of users, identities and sessions (B-148). User creation, role changes, identity linking and session control are
-- admin-only SECURITY DEFINER functions that audit themselves in the tenant ledger; the application role loses direct INSERT on users, so a
-- compromised application cannot mint users or roles outside these checks.
revoke insert on users from uw_app;
alter table auth.sessions add column user_agent text;

create function auth.audit_event(p_action text, p_subject jsonb) returns void language sql as $$
  insert into public.audit_events (tenant_id, seq, prev_hash, hash, at, actor_kind, actor_id, action, subject, inputs_ref, result)
  values (app_tenant_id(), 0, '', '', now(), 'user', app_user_id()::text, p_action, p_subject, '{}', 'ok')
$$;

create function auth.require_admin() returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if app_tenant_id() is null or app_user_id() is null then raise exception 'no actor' using errcode = '42501'; end if;
  if coalesce(auth.actor_role(), '') <> 'admin' then raise exception 'only an admin may do this' using errcode = '42501'; end if;
end $$;

-- login gains the user agent (shown to the user in their session list)
drop function auth.login(text, text, bytea, interval);
create function auth.login(p_issuer text, p_subject text, p_token_hash bytea, p_absolute interval, p_user_agent text default null)
returns table (session_id uuid, tenant_id uuid, user_id uuid, role text) language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare i auth.identities%rowtype; st record; sid uuid;
begin
  select * into i from auth.identities where issuer = p_issuer and subject = p_subject;
  if not found then return; end if;
  select * into st from auth.user_state(i.tenant_id, i.user_id);
  if st.o_role is null or st.o_disabled then return; end if;
  if p_absolute <= interval '0' or p_absolute > interval '30 days' then raise exception 'invalid session lifetime'; end if;
  insert into auth.sessions (tenant_id, user_id, token_hash, expires_at, user_agent)
  values (i.tenant_id, i.user_id, p_token_hash, now() + p_absolute, left(p_user_agent, 160)) returning id into sid;
  return query select sid, i.tenant_id, i.user_id, st.o_role;
end $$;

create function auth.create_user(p_email text, p_role text) returns uuid language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_id uuid;
begin
  perform auth.require_admin();
  if p_role not in ('viewer', 'processor', 'underwriter', 'admin') then raise exception 'invalid role' using errcode = '22023'; end if;
  if length(p_email) > 254 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid email address' using errcode = '22023'; end if;
  insert into public.users (tenant_id, email, role) values (app_tenant_id(), lower(p_email), p_role) returning id into v_id;
  perform auth.audit_event('admin.user_created', jsonb_build_object('userId', v_id, 'role', p_role));
  return v_id;
end $$;

-- The acting admin can neither change their own role nor disable themselves, so a tenant always keeps at least one enabled admin.
create function auth.set_user_role(p_user uuid, p_role text) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare v_old text;
begin
  perform auth.require_admin();
  if p_role not in ('viewer', 'processor', 'underwriter', 'admin') then raise exception 'invalid role' using errcode = '22023'; end if;
  if p_user = app_user_id() then raise exception 'an admin may not change their own role' using errcode = '42501'; end if;
  select role into v_old from public.users where id = p_user and tenant_id = app_tenant_id();
  if v_old is null then raise exception 'unknown user' using errcode = '42501'; end if;
  update public.users set role = p_role where id = p_user and tenant_id = app_tenant_id();
  perform auth.audit_event('admin.role_changed', jsonb_build_object('userId', p_user, 'from', v_old, 'to', p_role));
end $$;

create or replace function auth.set_user_disabled(p_user uuid, p_disabled boolean) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  perform auth.require_admin();
  if p_user = app_user_id() then raise exception 'an admin may not disable themselves' using errcode = '42501'; end if;
  if not exists (select 1 from public.users where id = p_user and tenant_id = app_tenant_id()) then raise exception 'unknown user' using errcode = '42501'; end if;
  update public.users set disabled_at = case when p_disabled then now() else null end where id = p_user and tenant_id = app_tenant_id();
  if p_disabled then update auth.sessions set revoked_at = now() where tenant_id = app_tenant_id() and user_id = p_user and revoked_at is null; end if;
  perform auth.audit_event(case when p_disabled then 'admin.user_disabled' else 'admin.user_enabled' end, jsonb_build_object('userId', p_user));
end $$;

create or replace function auth.link_identity(p_user uuid, p_issuer text, p_subject text) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  perform auth.require_admin();
  if not exists (select 1 from public.users where id = p_user and tenant_id = app_tenant_id()) then raise exception 'unknown user' using errcode = '42501'; end if;
  insert into auth.identities (tenant_id, user_id, issuer, subject) values (app_tenant_id(), p_user, p_issuer, p_subject);
  perform auth.audit_event('admin.identity_linked', jsonb_build_object('userId', p_user));
end $$;

create function auth.unlink_identity(p_user uuid) returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  perform auth.require_admin();
  if p_user = app_user_id() then raise exception 'an admin may not unlink their own identity' using errcode = '42501'; end if;
  delete from auth.identities where tenant_id = app_tenant_id() and user_id = p_user;
  update auth.sessions set revoked_at = now() where tenant_id = app_tenant_id() and user_id = p_user and revoked_at is null;
  perform auth.audit_event('admin.identity_unlinked', jsonb_build_object('userId', p_user));
end $$;

create or replace function auth.revoke_user_sessions(p_user uuid) returns int language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare n int;
begin
  if app_tenant_id() is null or app_user_id() is null then raise exception 'no actor' using errcode = '42501'; end if;
  if p_user <> app_user_id() and coalesce(auth.actor_role(), '') <> 'admin' then raise exception 'only an admin may revoke another user''s sessions' using errcode = '42501'; end if;
  update auth.sessions set revoked_at = now() where tenant_id = app_tenant_id() and user_id = p_user and revoked_at is null;
  get diagnostics n = row_count;
  if n > 0 then perform auth.audit_event('auth.sessions_revoked', jsonb_build_object('userId', p_user, 'count', n)); end if;
  return n;
end $$;

create function auth.list_users() returns table (id uuid, email text, role text, disabled boolean, issuer text, subject text, sessions int, last_seen timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  perform auth.require_admin();
  return query
    select u.id, u.email, u.role, u.disabled_at is not null, i.issuer, i.subject,
           (select count(*)::int from auth.sessions s where s.tenant_id = u.tenant_id and s.user_id = u.id and s.revoked_at is null and s.expires_at > now()),
           (select max(s.last_seen_at) from auth.sessions s where s.tenant_id = u.tenant_id and s.user_id = u.id),
           u.created_at
    from public.users u left join auth.identities i on i.tenant_id = u.tenant_id and i.user_id = u.id
    where u.tenant_id = app_tenant_id() order by u.email;
end $$;

create function auth.list_my_sessions(p_current bytea) returns table (id uuid, created_at timestamptz, last_seen_at timestamptz, expires_at timestamptz, user_agent text, is_current boolean)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  if app_tenant_id() is null or app_user_id() is null then raise exception 'no actor' using errcode = '42501'; end if;
  return query select s.id, s.created_at, s.last_seen_at, s.expires_at, s.user_agent, s.token_hash = p_current
    from auth.sessions s where s.tenant_id = app_tenant_id() and s.user_id = app_user_id() and s.revoked_at is null and s.expires_at > now() order by s.created_at desc;
end $$;

create function auth.revoke_my_session(p_session uuid) returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare n int;
begin
  if app_tenant_id() is null or app_user_id() is null then raise exception 'no actor' using errcode = '42501'; end if;
  update auth.sessions set revoked_at = now() where id = p_session and tenant_id = app_tenant_id() and user_id = app_user_id() and revoked_at is null;
  get diagnostics n = row_count;
  if n > 0 then perform auth.audit_event('auth.session_revoked', jsonb_build_object('userId', app_user_id())); end if;
  return n > 0;
end $$;

create function auth.revoke_my_other_sessions(p_current bytea) returns int language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare n int;
begin
  if app_tenant_id() is null or app_user_id() is null then raise exception 'no actor' using errcode = '42501'; end if;
  update auth.sessions set revoked_at = now() where tenant_id = app_tenant_id() and user_id = app_user_id() and revoked_at is null and token_hash <> p_current;
  get diagnostics n = row_count;
  if n > 0 then perform auth.audit_event('auth.sessions_revoked', jsonb_build_object('userId', app_user_id(), 'count', n, 'scope', 'others')); end if;
  return n;
end $$;

revoke all on function auth.audit_event(text, jsonb), auth.require_admin(), auth.login(text, text, bytea, interval, text), auth.create_user(text, text),
  auth.set_user_role(uuid, text), auth.unlink_identity(uuid), auth.list_users(), auth.list_my_sessions(bytea), auth.revoke_my_session(uuid), auth.revoke_my_other_sessions(bytea) from public;
grant execute on function auth.login(text, text, bytea, interval, text), auth.create_user(text, text), auth.set_user_role(uuid, text), auth.unlink_identity(uuid),
  auth.list_users(), auth.list_my_sessions(bytea), auth.revoke_my_session(uuid), auth.revoke_my_other_sessions(bytea) to uw_app;
-- create or replace kept the existing grants on set_user_disabled, link_identity and revoke_user_sessions; audit_event and require_admin stay internal.
