-- Forward-only. Applied as uw_owner. Every table: tenant_id, ENABLE + FORCE row level security, default deny.
revoke all on schema public from public;
grant usage on schema public to uw_app;

create function app_tenant_id() returns uuid language sql stable
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create function app_user_id() returns uuid language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function forbid_change() returns trigger language plpgsql
as $$ begin raise exception '% is append-only: % not allowed', tg_table_name, tg_op using errcode = '42501'; end $$;

-- tenants
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) > 0),
  created_at timestamptz not null default now()
);
alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenants_isolation on tenants using (id = app_tenant_id()) with check (id = app_tenant_id());

-- users (staff). Authentication is external (D-011); this table holds the role used by the decision gate.
create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  email text not null check (length(email) > 3),
  role text not null check (role in ('viewer','processor','underwriter','admin')),
  created_at timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, id)
);
alter table users enable row level security;
alter table users force row level security;
create policy users_isolation on users using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

-- cases
create table cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_ref text not null check (length(case_ref) > 0),
  idem_key text not null,
  status text not null default 'received'
    check (status in ('received','processing','needs_review','info_requested','approved','declined','handed_off','failed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idem_key)
);
alter table cases enable row level security;
alter table cases force row level security;
create policy cases_isolation on cases using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

-- documents (metadata only; bytes live in object storage)
create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  doc_type text not null,
  version int not null default 1 check (version > 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  unique (tenant_id, id),
  unique (tenant_id, case_id, content_sha256)
);
alter table documents enable row level security;
alter table documents force row level security;
create policy documents_isolation on documents using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

-- facts: a fact cannot exist without a citation (document, version, page, passage)
create table facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  key text not null,
  value text not null,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected')),
  doc_id uuid not null,
  doc_version int not null check (doc_version > 0),
  page int not null check (page > 0),
  passage text not null check (length(passage) > 0),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  foreign key (tenant_id, doc_id) references documents(tenant_id, id)
);
alter table facts enable row level security;
alter table facts force row level security;
create policy facts_isolation on facts using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

create function facts_guard() returns trigger language plpgsql as $$
begin
  if new.key is distinct from old.key or new.value is distinct from old.value or new.doc_id is distinct from old.doc_id
     or new.page is distinct from old.page or new.passage is distinct from old.passage or new.case_id is distinct from old.case_id then
    raise exception 'facts: only status may change' using errcode = '42501';
  end if;
  if old.status <> 'proposed' then
    raise exception 'facts: status % is final', old.status using errcode = '42501';
  end if;
  return new;
end $$;
create trigger facts_guard_trg before update on facts for each row execute function facts_guard();

-- decisions: append-only; only the authenticated underwriter of this tenant can record one
create table decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  decided_by uuid not null,
  decision text not null check (decision in ('approve','decline','request_more_info')),
  reasons text[] not null check (cardinality(reasons) > 0),
  policy_version text not null check (length(policy_version) > 0),
  overrides text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  foreign key (tenant_id, decided_by) references users(tenant_id, id)
);
alter table decisions enable row level security;
alter table decisions force row level security;
create policy decisions_read on decisions for select using (tenant_id = app_tenant_id());
create policy decisions_insert on decisions for insert with check (
  tenant_id = app_tenant_id()
  and decided_by = app_user_id()
  and exists (select 1 from users u where u.tenant_id = decisions.tenant_id and u.id = decisions.decided_by and u.role = 'underwriter')
);
create trigger decisions_append_only before update or delete on decisions for each row execute function forbid_change();
create trigger decisions_no_truncate before truncate on decisions for each statement execute function forbid_change();

-- audit ledger: append-only, hash-chained per tenant
create function audit_hash(p_tenant uuid, p_seq bigint, p_prev text, p_at timestamptz, p_kind text, p_actor text,
                           p_action text, p_subject jsonb, p_inputs text[], p_rule jsonb, p_llm jsonb, p_result text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(concat_ws('|', p_tenant::text, p_seq::text, p_prev,
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), p_kind, p_actor, p_action,
    coalesce(p_subject::text,''), coalesce(array_to_string(p_inputs, ','),''), coalesce(p_rule::text,''), coalesce(p_llm::text,''), p_result), 'UTF8')), 'hex')
$$;

create table audit_events (
  tenant_id uuid not null references tenants(id),
  seq bigint not null,
  prev_hash text not null,
  hash text not null,
  at timestamptz not null,
  actor_kind text not null check (actor_kind in ('user','agent','system')),
  actor_id text not null,
  action text not null check (length(action) > 0),
  subject jsonb not null default '{}',
  inputs_ref text[] not null default '{}',
  rule jsonb,
  llm jsonb,
  result text not null check (result in ('ok','rejected','error')),
  primary key (tenant_id, seq)
);
alter table audit_events enable row level security;
alter table audit_events force row level security;
create policy audit_read on audit_events for select using (tenant_id = app_tenant_id());
create policy audit_insert on audit_events for insert with check (tenant_id = app_tenant_id());

create function audit_chain() returns trigger language plpgsql as $$
declare last_seq bigint; last_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 0));
  select seq, hash into last_seq, last_hash from audit_events where tenant_id = new.tenant_id order by seq desc limit 1;
  new.seq := coalesce(last_seq, 0) + 1;
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.at := clock_timestamp();
  new.hash := audit_hash(new.tenant_id, new.seq, new.prev_hash, new.at, new.actor_kind, new.actor_id, new.action,
                         new.subject, new.inputs_ref, new.rule, new.llm, new.result);
  return new;
end $$;
create trigger audit_chain_trg before insert on audit_events for each row execute function audit_chain();
create trigger audit_append_only before update or delete on audit_events for each row execute function forbid_change();
create trigger audit_no_truncate before truncate on audit_events for each statement execute function forbid_change();

-- returns the first sequence number whose stored hash or link is wrong, or null when the chain is intact (RLS applies: invoker rights)
create function audit_verify_chain() returns bigint language plpgsql stable as $$
declare r record; expected_prev text := repeat('0', 64); expected_seq bigint := 1;
begin
  for r in select * from audit_events where tenant_id = app_tenant_id() order by seq loop
    if r.seq <> expected_seq or r.prev_hash <> expected_prev
       or r.hash <> audit_hash(r.tenant_id, r.seq, r.prev_hash, r.at, r.actor_kind, r.actor_id, r.action, r.subject, r.inputs_ref, r.rule, r.llm, r.result) then
      return r.seq;
    end if;
    expected_prev := r.hash; expected_seq := expected_seq + 1;
  end loop;
  return null;
end $$;

-- every recorded decision is audited in the same transaction
create function decisions_audit() returns trigger language plpgsql as $$
begin
  insert into audit_events (tenant_id, seq, prev_hash, hash, at, actor_kind, actor_id, action, subject, inputs_ref, result)
  values (new.tenant_id, 0, '', '', now(), 'user', new.decided_by::text, 'decision.recorded',
          jsonb_build_object('caseId', new.case_id, 'decision', new.decision), array[new.id::text], 'ok');
  return new;
end $$;
create trigger decisions_audit_trg after insert on decisions for each row execute function decisions_audit();

-- a case can reach approved/declined only through a recorded decision that says so
create function cases_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('approved','declined') and new.status is distinct from old.status then
    if not exists (select 1 from decisions d where d.tenant_id = new.tenant_id and d.case_id = new.id
                   and ((new.status = 'approved' and d.decision = 'approve') or (new.status = 'declined' and d.decision = 'decline'))) then
      raise exception 'cases: % requires a recorded human decision', new.status using errcode = '42501';
    end if;
  end if;
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id or new.idem_key is distinct from old.idem_key then
    raise exception 'cases: identity columns are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger cases_guard_trg before update on cases for each row execute function cases_guard();

-- least privilege for the application role
grant select on tenants to uw_app;
grant select, insert on users to uw_app;
grant select, insert, update (status) on cases to uw_app;
grant select, insert on documents to uw_app;
grant select, insert, update (status) on facts to uw_app;
grant select, insert on decisions to uw_app;
grant select, insert on audit_events to uw_app;
grant execute on function audit_verify_chain() to uw_app;
