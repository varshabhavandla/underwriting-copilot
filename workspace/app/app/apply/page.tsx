import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { withTenant } from "@/db/client";
import { submitApplication } from "@/application/submit";
import { services } from "@/server/services";

export const dynamic = "force-dynamic";

const PURPOSES = ["working_capital", "equipment", "real_estate", "refinance", "change_of_ownership", "inventory", "other"] as const;

async function submit(form: FormData): Promise<void> {
  "use server";
  const s = services();
  if (!s) redirect("/apply?error=" + encodeURIComponent("Sign-in is not available yet"));
  const owners = [1, 2, 3]
    .map((i) => ({ name: String(form.get(`owner${i}Name`) ?? "").trim(), percent: Number(form.get(`owner${i}Percent`) ?? 0) }))
    .filter((o) => o.name !== "" || o.percent > 0);
  const raw = {
    legalName: String(form.get("legalName") ?? ""),
    entityType: String(form.get("entityType") ?? ""),
    ein: String(form.get("ein") ?? ""),
    naics: String(form.get("naics") ?? ""),
    yearsInBusiness: Number(form.get("yearsInBusiness") ?? NaN),
    loanAmount: String(form.get("loanAmount") ?? ""),
    purposes: form.getAll("purposes").map(String),
    owners,
    certifyAccurate: form.get("certifyAccurate") === "on",
  };
  let caseId: string;
  try {
    const r = await withTenant(s!.sql, { tenantId: s!.tenantId, ...(s!.userId ? { userId: s!.userId } : {}) }, (tx) => submitApplication(tx, s!.keys, s!.tenantId, raw));
    caseId = r.caseId;
  } catch (e) {
    if (e instanceof ZodError) redirect("/apply?error=" + encodeURIComponent(e.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).join("; ")));
    throw e;
  }
  redirect("/apply?submitted=" + encodeURIComponent(caseId));
}

export default async function Apply({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string }> }) {
  const { error, submitted } = await searchParams;
  return (
    <main>
      <h1>Loan application</h1>
      <p><strong>Synthetic data only.</strong> Do not enter real borrower information.</p>
      {submitted && <p role="status">Application received. Reference: <code>{submitted}</code></p>}
      {error && <p role="alert" style={{ color: "#b00020" }}>{error}</p>}
      <form action={submit} style={{ display: "grid", gap: "0.75rem" }}>
        <label>Legal business name <input name="legalName" required maxLength={200} /></label>
        <label>Entity type
          <select name="entityType" required defaultValue="llc">
            {["sole_proprietorship", "partnership", "llc", "s_corp", "c_corp", "nonprofit", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>EIN (9 digits) <input name="ein" required pattern="\d{2}-?\d{7}" inputMode="numeric" autoComplete="off" /></label>
        <label>NAICS (6 digits) <input name="naics" required pattern="\d{6}" inputMode="numeric" /></label>
        <label>Years in business <input name="yearsInBusiness" type="number" min={0} required /></label>
        <label>Loan amount (USD) <input name="loanAmount" required inputMode="decimal" /></label>
        <fieldset>
          <legend>Purposes</legend>
          {PURPOSES.map((p) => <label key={p} style={{ display: "block" }}><input type="checkbox" name="purposes" value={p} /> {p}</label>)}
        </fieldset>
        <fieldset>
          <legend>Owners (must total 100 percent)</legend>
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <input name={`owner${i}Name`} placeholder={`Owner ${i} name`} maxLength={200} />{" "}
              <input name={`owner${i}Percent`} type="number" step="0.01" min={0} max={100} placeholder="%" />
            </div>
          ))}
        </fieldset>
        <label><input type="checkbox" name="certifyAccurate" /> I certify the information is accurate</label>
        <button type="submit">Submit application</button>
      </form>
    </main>
  );
}
