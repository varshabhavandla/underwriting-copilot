-- Evidence behind each fact: which deterministic checks it passed. The score is the fraction of applicable checks passed.
-- It is NOT the model's confidence, which is recorded in the audit ledger only.
alter table facts add column evidence jsonb not null default '{}';
alter table facts add column evidence_score numeric(4,3) not null default 0 check (evidence_score between 0 and 1);
