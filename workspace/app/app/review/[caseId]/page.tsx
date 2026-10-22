import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withTenant } from "@/db/client";
import { adoptMemo, ActionDenied, decideCase, disposeException, type DecisionKind } from "@/review/actions";
import { caseDetail, describeCite } from "@/review/queries";
import { requireSession } from "@/server/guard";
import { can, type Action } from "@/auth/roles";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (c: string) => `$${(BigInt(c) / 100n).toLocaleString("en-US")}`;
const ctxOf = async (action: Action, caseId?: string) => {
  const s = await requireSession(action, caseId ? `/review/${caseId}` : "/review");
  return { s, ctx: { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) } };
};
const back = (caseId: string, msg?: string) => redirect(`/review/${caseId}${msg ? "?msg=" + encodeURIComponent(msg) : ""}`);

async function decide(form: FormData): Promise<void> {
  "use server";
  const { s, ctx } = await ctxOf("decide", String(form.get("caseId")));
  const caseId = String(form.get("caseId"));
  const decision = String(form.get("decision")) as DecisionKind;
  if (!UUID.test(caseId) || !["approve", "decline", "request_more_info"].includes(decision)) return back(caseId, "invalid request");
  try {
    const r = await decideCase(s.sql, ctx, { caseId, decision, reasons: String(form.get("reasons") ?? "").split("\n"), overrides: String(form.get("overrides") ?? "").split("\n") });
    return back(caseId, `Decision recorded: ${r.status}`);
  } catch (e) {
    if (e instanceof ActionDenied) return back(caseId, e.message);
    throw e;
  }
}
async function dispose(form: FormData): Promise<void> {
  "use server";
  const { s, ctx } = await ctxOf("decide", String(form.get("caseId")));
  const caseId = String(form.get("caseId"));
  try {
    await disposeException(s.sql, ctx, { exceptionId: String(form.get("exceptionId")), note: String(form.get("note") ?? "") });
    return back(caseId, "Exception disposed");
  } catch (e) {
    if (e instanceof ActionDenied) return back(caseId, e.message);
    throw e;
  }
}
async function adopt(form: FormData): Promise<void> {
  "use server";
  const { s, ctx } = await ctxOf("decide", String(form.get("caseId")));
  const caseId = String(form.get("caseId"));
  try {
    await adoptMemo(s.sql, ctx, { memoId: String(form.get("memoId")) });
    return back(caseId, "Memo adopted");
  } catch (e) {
    if (e instanceof ActionDenied) return back(caseId, e.message);
    throw e;
  }
}

export default async function CaseReview({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { caseId } = await params;
  const { msg } = await searchParams;
  if (!UUID.test(caseId)) notFound();
  const s = await requireSession("view", `/review/${caseId}`);
  const d = await withTenant(s.sql, { tenantId: s.tenantId }, (tx) => caseDetail(tx, caseId));
  if (!d) notFound();
  const decided = ["approved", "declined"].includes(d.caseRow.status);
  const a = d.application;
  return (
    <main>
      <p><Link href="/review">← Files</Link></p>
      <h1>{a?.legal_name ?? d.caseRow.case_ref}</h1>
      <p>Status: <strong>{d.caseRow.status}</strong>. This file was prepared by software. Facts below are extracted and internally consistent; they are not verified against the original source.</p>
      {msg && <p role="status" style={{ background: "#eef", padding: 8 }}>{msg}</p>}

      {a && (
        <section><h2>Request</h2>
          <p>{usd(a.loan_amount_cents)} over {a.requested_term_months ?? "?"} months for {a.purposes.join(", ").replace(/_/g, " ")}. {a.entity_type}, NAICS {a.naics}, {a.years_in_business} years in business. EIN ending {a.ein_last4}.</p>
          <p>Owners: {a.owners.map((o) => `${o.name} ${o.percent}%`).join(", ")}</p>
        </section>
      )}

      <section><h2>Exceptions ({d.exceptions.filter((e) => e.status === "open").length} open)</h2>
        {d.exceptions.length === 0 && <p>None.</p>}
        <ul>{d.exceptions.map((e) => (
          <li key={e.id}>
            <strong>{e.severity}</strong> {e.kind}: {e.detail} {e.status === "disposed" ? <em>(disposed: {e.disposition_note})</em> : (
              <form action={dispose} style={{ display: "inline" }}>
                <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="exceptionId" value={e.id} />
                <input name="note" placeholder="disposition note (required)" required /> <button>Dispose</button>
              </form>)}
          </li>))}</ul>
      </section>

      <section><h2>Rule results (SBA SOP 50 10)</h2>
        <table cellPadding={4}><thead><tr><th align="left">Rule</th><th align="left">Outcome</th><th align="left">SOP section</th><th align="left">Detail</th></tr></thead>
          <tbody>{d.rules.map((r) => <tr key={r.rule_id}><td>{r.rule_id}</td><td>{r.outcome}</td><td>{r.sop_section}</td><td>{r.detail}</td></tr>)}</tbody></table>
        {d.rules.length === 0 && <p>Rules have not been run for this case.</p>}
      </section>

      <section><h2>Facts with citations</h2>
        <table cellPadding={4}><thead><tr><th align="left">Fact</th><th align="left">Value</th><th align="left">Status</th><th align="left">Evidence</th><th align="left">Source passage</th></tr></thead>
          <tbody>{d.facts.map((f) => <tr key={f.id}><td>{f.key}</td><td>{f.value}</td><td>{f.status}</td><td>{f.evidence_score}</td><td>p.{f.page}: “{f.passage}”</td></tr>)}</tbody></table>
      </section>

      <section><h2>Credit memo draft</h2>
        {!d.memo && <p>No verified memo draft (see exceptions).</p>}
        {d.memo && (<>
          {d.memo.sections.map((sec) => (
            <div key={sec.title}><h3>{sec.title}</h3><ul>{sec.lines.map((l, i) => <li key={i}>{l.text} <small>[{l.cites.map((c) => describeCite(c, d)).join("; ")}]</small></li>)}</ul></div>))}
          {d.memo.adopted ? <p><em>Adopted by an underwriter.</em></p> : (
            <form action={adopt}><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="memoId" value={d.memo.id} /><button>Adopt this memo</button></form>)}
        </>)}
      </section>

      <section><h2>Decision</h2>
        {d.decisions.map((x, i) => <p key={i}>Recorded: <strong>{x.decision}</strong> — {x.reasons.join("; ")}{x.overrides.length ? ` (overrides: ${x.overrides.join("; ")})` : ""} [{x.policy_version}]</p>)}
        {!decided && can(s.role, "decide") && (
          <form action={decide} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <input type="hidden" name="caseId" value={caseId} />
            <label><input type="radio" name="decision" value="approve" required /> Approve</label>
            <label><input type="radio" name="decision" value="decline" /> Decline</label>
            <label><input type="radio" name="decision" value="request_more_info" /> Request more information</label>
            <label>Reasons (one per line, required) <textarea name="reasons" rows={3} required /></label>
            <label>Overrides (one per line; required to approve with open critical or high exceptions) <textarea name="overrides" rows={2} /></label>
            <button type="submit">Record decision</button>
          </form>)}
      </section>

      <section><h2>Recent audit trail</h2>
        <ul>{d.audit.map((x) => <li key={x.seq}>#{x.seq} {x.action} by {x.actor_kind} at {x.at}</li>)}</ul>
      </section>
    </main>
  );
}
