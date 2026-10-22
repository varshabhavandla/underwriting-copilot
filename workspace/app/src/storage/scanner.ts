/**
 * Malware scanning of uploads. The scanner is a seam: ClamdScanner speaks the ClamAV daemon's INSTREAM protocol; NoScanner exists for local
 * development only (production refuses to start without a scanner). Scanning fails closed: if the scanner cannot answer, the upload is not accepted.
 */
import { connect } from "node:net";

export interface ScanResult { clean: boolean; signature?: string }
export interface MalwareScanner { readonly name: string; scan(bytes: Buffer): Promise<ScanResult> }

/** The scanner could not give an answer (down, timed out, protocol error). Callers must treat the file as not accepted. */
export class ScanUnavailable extends Error {}

export class NoScanner implements MalwareScanner {
  readonly name = "none";
  async scan(): Promise<ScanResult> { return { clean: true }; }
}

const CHUNK = 64 * 1024;

export class ClamdScanner implements MalwareScanner {
  readonly name = "clamd";
  constructor(private readonly host: string, private readonly port = 3310, private readonly timeoutMs = 15_000) {}

  scan(bytes: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const sock = connect({ host: this.host, port: this.port });
      const reply: Buffer[] = [];
      let settled = false;
      const done = (fn: () => void) => { if (!settled) { settled = true; sock.destroy(); fn(); } };
      sock.setTimeout(this.timeoutMs, () => done(() => reject(new ScanUnavailable("scanner timed out"))));
      sock.on("error", (e) => done(() => reject(new ScanUnavailable(`scanner unreachable: ${e.message}`))));
      sock.on("data", (d: Buffer) => reply.push(d));
      const finish = () => done(() => {
        const text = Buffer.concat(reply).toString("utf8").replace(/\0/g, "").trim();
        if (/^stream: OK$/.test(text)) return resolve({ clean: true });
        const found = /^stream: (.{1,200}) FOUND$/.exec(text);
        if (found) return resolve({ clean: false, signature: found[1]! });
        reject(new ScanUnavailable(`unexpected scanner reply: ${text.slice(0, 80) || "(none)"}`));
      });
      sock.on("end", finish);
      sock.on("close", finish);
      sock.on("connect", () => {
        sock.write("zINSTREAM\0");
        for (let off = 0; off < bytes.length; off += CHUNK) {
          const part = bytes.subarray(off, off + CHUNK);
          const len = Buffer.alloc(4); len.writeUInt32BE(part.length);
          sock.write(Buffer.concat([len, part]));
        }
        sock.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
    });
  }
}
