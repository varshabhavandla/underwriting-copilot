import { withTenant, type Sql, type TenantContext } from "../db/client";
import { appendAudit, recordDecision, setCaseStatus } from "../db/repo";
import { SBA_7A_PACK } from "../rules/sba7a";

export type DecisionKind = "approve" | "decline" | "request_more_info";
const STATUS: Record<DecisionKind, string> = { approve: "approved", decline: "declined", request_more_info: "info_requested" };

export class ActionDenied extends Error {}

/** Translates database rejections into messages a reviewer can act on, without exposing internals. */
function friendly(e: unknown): Error {
  const m = (e as Error).message ?? "";
  if (/row-level security/.test(m)) return new ActionDenied("not permitted: only an authorized underwriter acting as themselves can do this");
  if (/requires a recorded override/.test(m)) return new ActionDenied("approval with open critical or high exceptions requires at least one recorded override explaining why");
  if (/requires a recorded human decision/.test(m)) return new ActionDenied("the case status can only change through a recorded decision");
  if (/already decided|is final/.test(m)) return new ActionDenied("this case already has a final decision");
  if (/foreign key/.test(m)) return new ActionDenied("case not found");
  if (/exceptions_disposition_consistent|violates check constraint/.test(m)) return new ActionDenied("a note is required");
  return e as Error;
}

/** Records the underwriter's decision and moves the case. Both happen in one transaction; the database enforces who may do it. */
export async function decideCase(sql: Sql, ctx: TenantContext, input: { caseId: string; decision: DecisionKind; reasons: string[]; overrides?: string[] }): Promise<{ status: string }> {
  const reasons = input.reasons.map((r) => r.trim()).filter(Boolean);
  const uid = ctx.userId;
  if (!uid) throw new ActionDenied("not signed in");
  if (reasons.length === 0) throw new ActionDenied("at least one reason is required");
  try {
    return await withTenant(sql, ctx, async (tx) => {
      await recordDecision(tx, ctx.tenantId, {
        caseId: input.caseId, userId: uid, decision: input.decision, reasons,
        policyVersion: `${SBA_7A_PACK.name}@${SBA_7A_PACK.version}`, overrides: (input.overrides ?? []).map((o) => o.trim()).filter(Boolean),
      });
      await setCaseStatus(tx, input.caseId, STATUS[input.decision]);
      return { status: STATUS[input.decision] };
    });
  } catch (e) {
    throw friendly(e);
  }
}

export async function disposeException(sql: Sql, ctx: TenantContext, input: { exceptionId: string; note: string }): Promise<void> {
  const uid = ctx.userId;
  if (!uid) throw new ActionDenied("not signed in");
  try {
    const n = await withTenant(sql, ctx, (tx) => tx`update exceptions set status = 'disposed', disposition_note = ${input.note.trim()}, disposed_by = ${uid}, disposed_at = now() where id = ${input.exceptionId} and status = 'open'`);
    if (n.count === 0) throw new ActionDenied("exception not found or already disposed");
  } catch (e) {
    throw friendly(e);
  }
}

export async function adoptMemo(sql: Sql, ctx: TenantContext, input: { memoId: string }): Promise<void> {
  const uid = ctx.userId;
  if (!uid) throw new ActionDenied("not signed in");
  try {
    await withTenant(sql, ctx, async (tx) => {
      const [m] = await tx<{ case_id: string }[]>`select case_id from memos where id = ${input.memoId}`;
      if (!m) throw new ActionDenied("memo not found");
      await tx`insert into memo_adoptions (tenant_id, case_id, memo_id, adopted_by) values (${ctx.tenantId}, ${m.case_id}, ${input.memoId}, ${uid})`;
    });
  } catch (e) {
    if (/duplicate key/.test((e as Error).message)) throw new ActionDenied("memo already adopted");
    throw friendly(e);
  }
}

/**
 * An underwriter confirms or rejects a held (proposed) fact after checking it against the original document. This is how figures read by OCR, or from a
 * flagged document, become usable by the rules. A fact's status can change once, from proposed (the database makes any later change impossible).
 * Confirmation is a data check, not a credit decision. Rules must be run again afterwards.
 */
export async function reviewFact(sql: Sql, ctx: TenantContext, input: { factId: string; verdict: "confirm" | "reject"; note?: string }): Promise<{ key: string; caseId: string }> {
  const uid = ctx.userId;
  if (!uid) throw new ActionDenied("not signed in");
  const note = (input.note ?? "").trim();
  if (input.verdict === "reject" && note.length === 0) throw new ActionDenied("a note is required to reject a fact");
  try {
    return await withTenant(sql, ctx, async (tx) => {
      const rows = await tx<{ key: string; case_id: string }[]>`
        update facts set status = ${input.verdict === "confirm" ? "accepted" : "rejected"} where id = ${input.factId} and status = 'proposed' returning key, case_id`;
      if (rows.length === 0) throw new ActionDenied("fact not found or already reviewed");
      const f = rows[0]!;
      await appendAudit(tx, ctx.tenantId, {
        actorKind: "user", actorId: uid, action: input.verdict === "confirm" ? "fact.confirmed" : "fact.rejected",
        subject: { caseId: f.case_id, factId: input.factId, key: f.key, ...(note ? { note: note.slice(0, 300) } : {}) },
      });
      return { key: f.key, caseId: f.case_id };
    });
  } catch (e) {
    if (e instanceof ActionDenied) throw e;
    throw friendly(e);
  }
}
