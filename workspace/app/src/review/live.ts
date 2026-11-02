import { createHash } from "node:crypto";
import type { Tx } from "../db/client";

/**
 * Small, read-only snapshots the console polls to update itself (D-039). They carry ids, states and counts only: no names, amounts, passages or errors with
 * content. `version` changes exactly when something a screen shows has changed, so the browser refreshes only then.
 */
export interface CaseLive {
  version: string;
  status: string;
  active: boolean;
  documents: { id: string; docType: string; processing: "queued" | "processing" | "done" | "failed"; error: string | null }[];
  facts: { proposed: number; accepted: number; rejected: number };
  exceptionsOpen: number;
  rulesRun: boolean;
  memo: { stored: boolean; adopted: boolean };
  decisions: number;
}

export const ver = (o: unknown): string => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

export async function caseLive(tx: Tx, caseId: string): Promise<CaseLive | null> {
  const [c] = await tx<{ status: string }[]>`select status from cases where id = ${caseId}`;
  if (!c) return null;
  const documents = await tx<{ id: string; doc_type: string; processing: CaseLive["documents"][number]["processing"]; error: string | null }[]>`
    select d.id, d.doc_type, coalesce(p.status, 'done') as processing, p.error
    from documents d left join document_processing p on p.tenant_id = d.tenant_id and p.document_id = d.id
    where d.case_id = ${caseId} order by d.created_at, d.id`;
  const f = await tx<{ status: string; n: string }[]>`select status, count(*)::text as n from facts where case_id = ${caseId} group by status`;
  const n = (s: string) => Number(f.find((x) => x.status === s)?.n ?? 0);
  const [ex] = await tx<{ n: string }[]>`select count(*)::text as n from exceptions where case_id = ${caseId} and status = 'open'`;
  const [runs] = await tx<{ n: string }[]>`select count(*)::text as n from rule_runs where case_id = ${caseId}`;
  const [memo] = await tx<{ id: string; adopted: boolean }[]>`
    select m.id, exists (select 1 from memo_adoptions a where a.memo_id = m.id) as adopted from memos m where m.case_id = ${caseId} order by m.created_at desc limit 1`;
  const [dec] = await tx<{ n: string }[]>`select count(*)::text as n from decisions where case_id = ${caseId}`;
  const body = {
    status: c.status,
    active: documents.some((d) => d.processing === "queued" || d.processing === "processing"),
    documents: documents.map((d) => ({ id: d.id, docType: d.doc_type, processing: d.processing, error: d.error })),
    facts: { proposed: n("proposed"), accepted: n("accepted"), rejected: n("rejected") },
    exceptionsOpen: Number(ex?.n ?? 0),
    rulesRun: Number(runs?.n ?? 0) > 0,
    memo: { stored: Boolean(memo), adopted: Boolean(memo?.adopted) },
    decisions: Number(dec?.n ?? 0),
  };
  return { version: ver({ ...body, runs: Number(runs?.n ?? 0), memoId: memo?.id ?? null }), ...body };
}

export interface QueueLive { version: string; active: boolean; cases: { id: string; status: string; processing: number; openExceptions: number; hasMemo: boolean }[] }

export async function queueLive(tx: Tx): Promise<QueueLive> {
  const rows = await tx<{ id: string; status: string; processing: string; open: string; has_memo: boolean }[]>`
    select c.id, c.status,
      (select count(*) from document_processing p where p.case_id = c.id and p.status in ('queued', 'processing'))::text as processing,
      (select count(*) from exceptions e where e.case_id = c.id and e.status = 'open')::text as open,
      exists (select 1 from memos m where m.case_id = c.id) as has_memo
    from cases c order by c.created_at desc, c.id limit 200`;
  const cases = rows.map((r) => ({ id: r.id, status: r.status, processing: Number(r.processing), openExceptions: Number(r.open), hasMemo: r.has_memo }));
  return { version: ver(cases), active: cases.some((c) => c.processing > 0), cases };
}
