import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { withTenant } from "@/db/client";
import { adoptMemo, ActionDenied, decideCase, disposeException, reviewFact, type DecisionKind } from "@/review/actions";
import { caseDetail, describeCite } from "@/review/queries";
import { buildFile } from "@/file/buildFile";
import { acceptUpload } from "@/ingest/receive";
import { processDocument, retryProcessing, stalledDocuments } from "@/ingest/processing";
import { caseLive } from "@/review/live";
import { LiveRefresh } from "../live-refresh";
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
async function reviewFactAction(form: FormData): Promise<void> {
  "use server";
  const caseId = String(form.get("caseId"));
  const { s, ctx } = await ctxOf("decide", caseId);
  const verdict = String(form.get("verdict"));
  const factId = String(form.get("factId"));
  if (!UUID.test(caseId) || !UUID.test(factId) || !["confirm", "reject"].includes(verdict)) return back(caseId, "invalid request");
  try {
    const r = await reviewFact(s.sql, ctx, { factId, verdict: verdict as "confirm" | "reject", note: String(form.get("note") ?? "") });
    return back(caseId, `${r.key} ${verdict === "confirm" ? "confirmed" : "rejected"}. Rebuild the file to run the rules again.`);
  } catch (e) {
    if (e instanceof ActionDenied) return back(caseId, e.message);
    throw e;
  }
}
async function uploadDocuments(form: FormData): Promise<void> {
  "use server";
  const caseId = String(form.get("caseId"));
  const { s } = await ctxOf("intake", caseId);
  const docType = String(form.get("docType") ?? "");
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!UUID.test(caseId) || files.length === 0) return back(caseId, "choose at least one file");
  const lines: string[] = [];
  const queued: string[] = [];
  for (const f of files) {
    const r = await acceptUpload(s, caseId, { name: f.name, bytes: Buffer.from(await f.arrayBuffer()) }, docType);
    const b = r.body as { error?: string };
    if (r.documentId) queued.push(r.documentId);
    else lines.push(`${f.name.slice(0, 60)}: refused (${b.error})`);
  }
  // reading, OCR and the model take a while: answer now and keep working after the response; the page follows the progress by itself
  if (queued.length) {
    after(async () => { for (const id of queued) await processDocument(s, id); });
    lines.unshift(`${queued.length} file${queued.length === 1 ? "" : "s"} received and being processed`);
  }
  return back(caseId, lines.join("; "));
}
async function retryDocument(form: FormData): Promise<void> {
  "use server";
  const caseId = String(form.get("caseId"));
  const { s, ctx } = await ctxOf("intake", caseId);
  const documentId = String(form.get("documentId"));
  if (!UUID.test(caseId) || !UUID.test(documentId)) return back(caseId, "invalid request");
  if (await retryProcessing(s.sql, ctx, documentId)) { after(async () => { await processDocument(s, documentId); }); return back(caseId, "Processing again"); }
  return back(caseId, "That document is not waiting for a retry");
}
async function build(form: FormData): Promise<void> {
  "use server";
  const caseId = String(form.get("caseId"));
  const { s, ctx } = await ctxOf("build", caseId);
  if (!UUID.test(caseId)) return back(caseId, "invalid request");
  const r = await buildFile(s.sql, s.gateway, ctx, caseId, new Date());
  const n = (o: string) => r.results.filter((x) => x.outcome === o).length;
  return back(caseId, `File built: ${n("pass")} rules passed, ${n("needs_review")} need review, ${n("fail")} failed; memo ${r.memoStored ? "drafted and verified" : "not stored (" + r.memoProblems.length + " problems)"}; ${r.exceptionsRaised.length} exceptions raised. Nothing is approved: an underwriter decides.`);
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
  const [d, live] = await withTenant(s.sql, { tenantId: s.tenantId }, async (tx) => [await caseDetail(tx, caseId), await caseLive(tx, caseId)] as const);
  if (!d || !live) notFound();
  if (can(s.role, "intake")) {
    // self-healing: a document nobody is working on (the server restarted mid-way) is started again
    const ids = await stalledDocuments(s.sql, { tenantId: s.tenantId, ...(s.userId ? { userId: s.userId } : {}) }, caseId);
    if (ids.length) after(async () => { for (const id of ids) await processDocument(s, id); });
  }
  const decided = ["approved", "declined"].includes(d.caseRow.status);
  const a = d.application;
  return (
    <main>
      <p><Link href="/review">← Files</Link></p>
      <h1>{a?.legal_name ?? d.caseRow.case_ref}</h1>
      <p>Status: <strong>{d.caseRow.status}</strong>. This file was prepared by software. Facts below are extracted and internally consistent; they are not verified against the original source.</p>
      {msg && <p role="status" style={{ background: "#eef", padding: 8 }}>{msg}</p>}
      <LiveRefresh url={`/api/cases/${caseId}/live`} version={live.version} active={live.active} />

      {a && (
        <section><h2>Request</h2>
          <p>{usd(a.loan_amount_cents)} over {a.requested_term_months ?? "?"} months for {a.purposes.join(", ").replace(/_/g, " ")}. {a.entity_type}, NAICS {a.naics}, {a.years_in_business} years in business. EIN ending {a.ein_last4}.</p>
          <p>Owners: {a.owners.map((o) => `${o.name} ${o.percent}%`).join(", ")}</p>
        </section>
      )}

      {!decided && can(s.role, "intake") && (
        <section><h2>Documents</h2>
          <p>{d.documents.length === 0 ? "No documents yet." : `Received: ${d.documents.map((x) => x.doc_type.replace(/_/g, " ")).join(", ")}.`} Accepted: PDF, PNG, JPEG, or plain text (.txt, .csv), up to 4 MB each. Text is read now; PDFs and images are stored and need manual reading until OCR exists.</p>
          <form action={uploadDocuments} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <input type="hidden" name="caseId" value={caseId} />
            <label>Document type <select name="docType" defaultValue="bank_statement"><option value="tax_return">Tax return</option><option value="bank_statement">Bank statement</option><option value="financial_statement">Financial statement</option></select></label>
            <label>Files <input type="file" name="file" multiple required /></label>
            <button type="submit">Upload</button>
          </form>
          {can(s.role, "build") && (
            <form action={build} style={{ marginTop: 12 }}>
              <input type="hidden" name="caseId" value={caseId} />
              <button type="submit">{d.rules.length ? "Rebuild the file (rules and memo)" : "Build the file (run rules, draft the memo)"}</button>
            </form>)}
        </section>
      )}

      {live.documents.length > 0 && (
        <section><h2>Document processing</h2>
          <ul data-testid="documents">{live.documents.map((x) => (
            <li key={x.id} data-state={x.processing}>
              {x.docType.replace(/_/g, " ")}: <strong>{x.processing === "queued" ? "waiting" : x.processing === "processing" ? "processing" : x.processing === "failed" ? "failed" : "done"}</strong>
              {x.processing === "failed" && x.error ? ` (${x.error})` : ""}
              {x.processing === "failed" && !decided && can(s.role, "intake") && (
                <form action={retryDocument} style={{ display: "inline", marginLeft: 8 }}><input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="documentId" value={x.id} /><button>Retry</button></form>)}
            </li>))}</ul>
        </section>
      )}

      <section><h2>Exceptions ({d.exceptions.filter((e) => e.status === "open").length} open)</h2>
        {d.exceptions.length === 0 && <p>None.</p>}
        <ul>{d.exceptions.map((e) => (
          <li key={e.id}>
            <strong className={`pill pill-${e.severity}`}>{e.severity}</strong> {e.kind}: {e.detail} {e.status === "disposed" ? <em>(disposed: {e.disposition_note})</em> : (
              <form action={dispose} style={{ display: "inline" }}>
                <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="exceptionId" value={e.id} />
                <input name="note" placeholder="disposition note (required)" required /> <button>Dispose</button>
              </form>)}
          </li>))}</ul>
      </section>

      <section><h2>Rule results (SBA SOP 50 10)</h2>
        <div className="table-wrap"><table cellPadding={4}><thead><tr><th align="left">Rule</th><th align="left">Outcome</th><th align="left">SOP section</th><th align="left">Detail</th></tr></thead>
          <tbody>{d.rules.map((r) => <tr key={r.rule_id}><td>{r.rule_id}</td><td><span className={`pill pill-${r.outcome}`}>{r.outcome}</span></td><td>{r.sop_section}</td><td>{r.detail}</td></tr>)}</tbody></table></div>
        {d.rules.length === 0 && <p>Rules have not been run for this case.</p>}
      </section>

      <section><h2>Facts with citations</h2>
        <div className="table-wrap"><table cellPadding={4}><thead><tr><th align="left">Fact</th><th align="left">Value</th><th align="left">Status</th><th align="left">Evidence</th><th align="left">Source passage</th>{!decided && can(s.role, "decide") && <th align="left">Review</th>}</tr></thead>
          <tbody>{d.facts.map((f) => <tr key={f.id}><td>{f.key}</td><td>{f.value}</td><td><span className={`pill pill-${f.status}`}>{f.status}</span></td><td>{f.evidence_score}</td><td>p.{f.page}: “{f.passage}”</td>{!decided && can(s.role, "decide") && (
            <td>{f.status === "proposed" ? (
              <form action={reviewFactAction} style={{ display: "grid", gap: 4 }}>
                <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="factId" value={f.id} />
                <input name="note" placeholder="note (required to reject)" aria-label={`note for ${f.key}`} />
                <span><button name="verdict" value="confirm">Confirm against original</button> <button name="verdict" value="reject">Reject</button></span>
              </form>) : null}</td>)}</tr>)}</tbody></table></div>
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
