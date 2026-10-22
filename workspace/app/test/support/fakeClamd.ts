/**
 * A stand-in for the ClamAV daemon's INSTREAM protocol, for tests and local development ONLY. It reports FOUND when the stream contains the standard
 * EICAR test string, and can be told to misbehave. It is not a scanner.
 */
import { createServer, type Server } from "node:net";

/** The industry-standard harmless antivirus test string, assembled at run time so this file does not trip scanners itself. */
export const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!", "$H+H*"].join("");

export type ClamdMode = "normal" | "slow" | "error" | "garbage" | "hangup";
export interface FakeClamd { port: number; server: Server; mode: ClamdMode; streamed: number[]; scans: number; close(): Promise<void> }

export async function startFakeClamd(port = 0): Promise<FakeClamd> {
  const state: FakeClamd = { port: 0, server: undefined as never, mode: "normal", streamed: [], scans: 0, close: async () => {} };
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((sock) => {
    sockets.add(sock); sock.on("close", () => sockets.delete(sock));
    let buf = Buffer.alloc(0), started = false;
    const body: Buffer[] = [];
    const reply = (s: string) => { sock.write(s + "\0"); sock.end(); };
    sock.on("error", () => undefined);
    sock.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (!started) {
        const i = buf.indexOf(0);
        if (i < 0) return;
        if (buf.subarray(0, i).toString() !== "zINSTREAM") return reply("UNKNOWN COMMAND");
        started = true; buf = buf.subarray(i + 1);
      }
      for (;;) {
        if (buf.length < 4) return;
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          state.scans++;
          const all = Buffer.concat(body);
          state.streamed.push(all.length);
          if (state.mode === "hangup") return void sock.destroy();
          if (state.mode === "slow") return; // never answers
          if (state.mode === "garbage") return reply("what is this");
          if (state.mode === "error") return reply("INSTREAM size limit exceeded. ERROR");
          return reply(all.includes(EICAR) ? "stream: Win.Test.EICAR_HDB-1 FOUND" : "stream: OK");
        }
        if (buf.length < 4 + len) return;
        body.push(buf.subarray(4, 4 + len)); buf = buf.subarray(4 + len);
      }
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  state.port = (server.address() as { port: number }).port; state.server = server;
  state.close = () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); });
  return state;
}
