import { serverEnv } from "@/server-env";

/** Shown on every page of a deployment that runs without a malware scanner (a test deployment). It cannot be missed and cannot be dismissed. */
export function TestBanner() {
  let on = false;
  try { on = serverEnv().ALLOW_UNSCANNED_UPLOADS === "test-environment-only"; } catch { return null; }
  if (!on) return null;
  return (
    <div role="alert" style={{ background: "var(--high)", color: "#000", padding: "6px 12px", margin: "-28px -20px 16px", fontWeight: 600 }}>
      TEST ENVIRONMENT. Synthetic data only. Uploads are not malware-scanned.
    </div>
  );
}
