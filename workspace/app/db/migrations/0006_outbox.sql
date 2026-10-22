-- Outbox for events to the lender's systems. An event can exist only if a matching human decision exists; delivery state is the only mutable part.
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  case_id uuid not null,
  decision_id uuid not null references decisions(id),
  event_type text not null check (event_type in ('case.approved','case.declined','case.info_requested')),
  payload jsonb not null,
  idempotency_key text not null check (length(idempotency_key) > 0),
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  delivered_at timestamptz,
  external_id text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, case_id) references cases(tenant_id, id),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, decision_id)
);
alter table outbox_events enable row level security;
alter table outbox_events force row level security;
create policy outbox_read on outbox_events for select using (tenant_id = app_tenant_id());
create policy outbox_insert on outbox_events for insert with check (
  tenant_id = app_tenant_id()
  and exists (select 1 from decisions d where d.id = outbox_events.decision_id and d.tenant_id = outbox_events.tenant_id and d.case_id = outbox_events.case_id
              and ((outbox_events.event_type = 'case.approved' and d.decision = 'approve')
                or (outbox_events.event_type = 'case.declined' and d.decision = 'decline')
                or (outbox_events.event_type = 'case.info_requested' and d.decision = 'request_more_info'))));
create policy outbox_update on outbox_events for update using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());

create function outbox_guard() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id or new.case_id is distinct from old.case_id
     or new.decision_id is distinct from old.decision_id or new.event_type is distinct from old.event_type
     or new.payload is distinct from old.payload or new.idempotency_key is distinct from old.idempotency_key or new.created_at is distinct from old.created_at then
    raise exception 'outbox_events: only delivery state may change' using errcode = '42501';
  end if;
  if old.status <> 'pending' and (new.status is distinct from old.status) then
    raise exception 'outbox_events: % is final', old.status using errcode = '42501';
  end if;
  if new.attempts < old.attempts then
    raise exception 'outbox_events: attempts cannot decrease' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger outbox_guard_trg before update on outbox_events for each row execute function outbox_guard();
create trigger outbox_no_delete before delete on outbox_events for each row execute function forbid_change();
create trigger outbox_no_truncate before truncate on outbox_events for each statement execute function forbid_change();

-- every recorded decision queues exactly one event, in the same transaction
create function decisions_outbox() returns trigger language plpgsql as $$
begin
  insert into outbox_events (tenant_id, case_id, decision_id, event_type, payload, idempotency_key)
  values (new.tenant_id, new.case_id, new.id,
          case new.decision when 'approve' then 'case.approved' when 'decline' then 'case.declined' else 'case.info_requested' end,
          jsonb_build_object('caseId', new.case_id, 'decisionId', new.id, 'decision', new.decision, 'decidedBy', new.decided_by, 'policyVersion', new.policy_version, 'decidedAt', new.created_at),
          'decision:' || new.id::text);
  return new;
end $$;
create trigger decisions_outbox_trg after insert on decisions for each row execute function decisions_outbox();

grant select, insert on outbox_events to uw_app;
grant update (status, attempts, next_attempt_at, locked_until, last_error, delivered_at, external_id) on outbox_events to uw_app;
