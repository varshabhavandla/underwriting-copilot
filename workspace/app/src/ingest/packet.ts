import { createHash } from "node:crypto";
import { withTenant, type Sql, type TenantContext } from "../db/client";
import { addDocument, createCase } from "../db/repo";
import type { LlmGateway } from "../llm/gateway";
import type { SynthPacket } from "../synthetic/generate";
import { ingestDocument, type IngestResult } from "./ingest";

export interface PacketResult {
  caseId: string;
  docs: { docId: string; documentId: string; result: IngestResult }[];
}

/** Creates the case and document rows for a packet and ingests every document. Used by tests, the evaluation and the demo. */
export async function ingestPacket(sql: Sql, gateway: LlmGateway, asOf: Date, ctx: TenantContext, packet: SynthPacket): Promise<PacketResult> {
  const hashes = packet.docs.map((d) => createHash("sha256").update(d.pages.join("\n")).digest("hex"));
  const created = await withTenant(sql, ctx, async (tx) => {
    const c = await createCase(tx, ctx.tenantId, { caseRef: packet.caseRef, docHashes: hashes });
    const ids: string[] = [];
    for (const [i, d] of packet.docs.entries()) {
      ids.push(await addDocument(tx, ctx.tenantId, { caseId: c.id, docType: d.type, contentSha256: hashes[i]!, storageKey: `${ctx.tenantId}/${c.id}/${hashes[i]}`, version: 1 }));
    }
    return { caseId: c.id, ids };
  });
  const docs: PacketResult["docs"] = [];
  for (const [i, d] of packet.docs.entries()) {
    const result = await ingestDocument(sql, gateway, asOf, ctx, { caseId: created.caseId, documentId: created.ids[i]!, docVersion: 1, docType: d.type, pages: d.pages });
    docs.push({ docId: d.id, documentId: created.ids[i]!, result });
  }
  return { caseId: created.caseId, docs };
}
