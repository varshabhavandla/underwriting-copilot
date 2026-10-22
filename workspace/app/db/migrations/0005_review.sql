-- Underwriter review: exception disposition, memo adoption, and an override rule for approvals. Forward-only.

-- exceptions: only an underwriter, acting as themselves, may dispose of one, with a note
alter table exceptions add column disposition_note text;
alter table exceptions add column disposed_by uuid;
alter table exceptions add column disposed_at timestamptz;
alter table exceptions add foreign key (tenant_id, disposed_by) references users(tenant_id, id);
alter table exceptions add constraint exceptions_disposition_consistent check (
  (status = 'open' and disposed_by is null and disposition_note is null and disposed_at is null)
  or (status = 'disposed' and disposed_by is not null and disposed_at is not null and length(btrim(disposition_note)) > 0));

drop policy exceptions_isolation on exceptions;
create policy exceptions_read on exceptions for select using (tenant_id = app_tenant_id());
create policy exceptions_insert on exceptions for insert with check (tenant_id = app_tenant_id());
create policy exceptions_dispose on exceptions for update
  using (tenant_id = app_tenant_id() and status = 'open')
  with check (
    tenant_id = app_tenant_id() and status = 'disposed' and disposed_by = app_user_id()
    and exists (select 1 from users u where u.tenant_id = exceptions.tenant_id and u.id = exceptions.disposed_by and u.role = 'underwriter'));
grant update (status, disposition_note, disposed_by, disposed_at) on exceptions to uw_app;

create function exceptions_guard() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id or new.case_id is distinct from old.case_id
     or new.kind is distinct from old.kind or new.severity is distinct from old.severity or new.detail is distinct from old.detail
     or new.source is distinct from old.source or new.document_id is distinct from old.document_id then
    raise exception 'exceptions: only the disposition may change' using errcode = '42501';
  end if;
  new.disposed_at := now();
  insert into audit_events (tenant_id, seq, prev_hash, hash, at, actor_kind, actor_id, action, subject, result)
  values (new.tenant_id, 0, '', '', now(), 'user', new.disposed_by::text, 'exception.disposed',
          jsonb_build_object('caseId', new.case_id, 'exceptionId', new.id, 'kind', new.kind, 'severity', new.severity), 'ok');
  return new;
end $$;
create trigger exceptions_guard_trg before update on exceptions for each row execute function exceptions_guard();

-- approving while high or critical exceptions are open needs an explicit recorded override
create function decisions_override_guard() returns trigger language plpgsql as $$
begin
  if new.decision = 'approve' and cardinality(new.overrides) = 0 and exists (
       select 1 from exceptions e where e.tenant_id = new.tenant_id and e.case_id = new.case_id and e.status = 'open' and e.severity in ('critical','high')) then
    raise exception 'approval with open critical or high exceptions requires a recorded override' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger decisions_override_guard_trg before insert on decisions for each row execute function decisions_override_guard();

-- memo adoption: the underwriter takes ownership of the drafted memo
create table memo_adoptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  memo_id uuid not null references memos(id),
  adopted_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  foreign key (tenant_id, adopted_by) references users(tenant_id, id),
  unique (tenant_id, memo_id)
);
alter table memo_adoptions enable row level security;
alter table memo_adoptions force row level security;
create policy memo_adoptions_read on memo_adoptions for select using (tenant_id = app_tenant_id());
create policy memo_adoptions_insert on memo_adoptions for insert with check (
  tenant_id = app_tenant_id() and adopted_by = app_user_id()
  and exists (select 1 from users u where u.tenant_id = memo_adoptions.tenant_id and u.id = memo_adoptions.adopted_by and u.role = 'underwriter'));
create trigger memo_adoptions_append_only before update or delete on memo_adoptions for each row execute function forbid_change();
create function memo_adoptions_audit() returns trigger language plpgsql as $$
begin
  insert into audit_events (tenant_id, seq, prev_hash, hash, at, actor_kind, actor_id, action, subject, inputs_ref, result)
  values (new.tenant_id, 0, '', '', now(), 'user', new.adopted_by::text, 'memo.adopted', jsonb_build_object('caseId', new.case_id, 'memoId', new.memo_id), array[new.memo_id::text], 'ok');
  return new;
end $$;
create trigger memo_adoptions_audit_trg after insert on memo_adoptions for each row execute function memo_adoptions_audit();
grant select, insert on memo_adoptions to uw_app;

-- a decided case is final: no second decision, and approved/declined cannot flip (only approved -> handed_off)
create function decisions_final_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from cases c where c.tenant_id = new.tenant_id and c.id = new.case_id and c.status in ('approved','declined','handed_off')) then
    raise exception 'case is already decided' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger decisions_final_guard_trg before insert on decisions for each row execute function decisions_final_guard();

create or replace function cases_guard() returns trigger language plpgsql as $$
begin
  if new.status in ('approved','declined') and new.status is distinct from old.status then
    if not exists (select 1 from decisions d where d.tenant_id = new.tenant_id and d.case_id = new.id
                   and ((new.status = 'approved' and d.decision = 'approve') or (new.status = 'declined' and d.decision = 'decline'))) then
      raise exception 'cases: % requires a recorded human decision', new.status using errcode = '42501';
    end if;
  end if;
  if old.status in ('approved','declined','handed_off') and new.status is distinct from old.status
     and not (old.status = 'approved' and new.status = 'handed_off') then
    raise exception 'cases: % is final', old.status using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id or new.idem_key is distinct from old.idem_key then
    raise exception 'cases: identity columns are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
