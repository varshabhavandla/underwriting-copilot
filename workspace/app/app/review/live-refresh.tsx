"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Keeps a page current without a manual reload (D-039). It asks a small read-only route whether anything changed and refreshes the page only when the
 * answer's version differs. Polls quickly while documents are being processed and slowly otherwise, and pauses while the tab is hidden.
 * Plain polling is used on purpose: it needs no long-lived connection, so it behaves the same behind any proxy, on serverless hosts and under row-level security.
 */
export function LiveRefresh({ url, version, active, fastMs = 1500, slowMs = 15000 }: { url: string; version: string; active: boolean; fastMs?: number; slowMs?: number }) {
  const router = useRouter();
  const last = useRef(version);
  const [busy, setBusy] = useState(active);
  const [paused, setPaused] = useState(false);

  useEffect(() => { last.current = version; setBusy(active); }, [version, active]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => { if (!stopped) timer = setTimeout(tick, ms); };
    async function tick() {
      if (stopped) return;
      if (document.hidden) return schedule(slowMs);
      try {
        const r = await fetch(url, { cache: "no-store", redirect: "error", headers: { accept: "application/json" } });
        if (r.status === 401 || r.status === 403 || r.status === 404) { setPaused(true); return; } // signed out or no access: stop quietly
        if (!r.ok) throw new Error("bad status");
        const j = (await r.json()) as { version: string; active: boolean };
        setPaused(false);
        setBusy(j.active);
        if (j.version !== last.current) { last.current = j.version; router.refresh(); }
        schedule(j.active ? fastMs : slowMs);
      } catch {
        setPaused(true);
        schedule(slowMs);
      }
    }
    const onVisible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    schedule(busy ? fastMs : slowMs);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fastMs, slowMs]);

  return (
    <p role="status" aria-live="polite" data-live={busy ? "active" : "idle"} style={{ margin: "4px 0", minHeight: "1.2em", color: "#445" }}>
      {busy ? "Processing documents. This page updates by itself." : ""}
      {paused ? " Live updates are paused; reload the page to refresh." : ""}
    </p>
  );
}
