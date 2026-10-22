/**
 * Scans tracked files for secrets before they are committed or merged. Lightweight and dependency-free; it complements, and does not replace,
 * a full scanner (gitleaks) in CI (B-120). Add `secret-scan:allow` on a line to allow a deliberate example. Exit 1 on any finding.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Finding { file: string; line: number; rule: string }

const RULES: { id: string; re: RegExp }[] = [
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "openai-style-key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: "assigned-secret", re: /\b(?:api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*["'][A-Za-z0-9/+_=-]{20,}["']/i },
];
// credentials embedded in a URL, except the documented local-development ones
const URL_CRED = /:\/\/([^:@/\s]+):([^@/\s]+)@/;
const DEV_PASSWORDS = new Set(["uw_owner_dev", "uw_app_dev", "postgres", "password", "pw", "x"]);

export function scanText(file: string, text: string): Finding[] {
  const out: Finding[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.includes("secret-scan:allow")) return;
    for (const r of RULES) if (r.re.test(line)) out.push({ file, line: i + 1, rule: r.id });
    const m = URL_CRED.exec(line);
    if (m && !DEV_PASSWORDS.has(m[2]!) && !/^<|^\$|^\{|^%/.test(m[2]!)) out.push({ file, line: i + 1, rule: "url-credentials" });
  });
  return out;
}

const SKIP = /(^|\/)(package-lock\.json|node_modules\/|\.next\/)|\.(png|jpg|jpeg|pdf|ico)$/;
export function scanRepo(root: string): Finding[] {
  const files = execFileSync("git", ["ls-files"], { cwd: root }).toString().split("\n").filter((f) => f && !SKIP.test(f));
  const out: Finding[] = [];
  for (const f of files) {
    let text: string;
    try { text = readFileSync(join(root, f), "utf8"); } catch { continue; }
    if (text.includes("\u0000")) continue;
    out.push(...scanText(f, text));
  }
  return out;
}

if (process.argv[1]?.endsWith("secret-scan.ts")) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: import.meta.dirname }).toString().trim();
  const findings = scanRepo(root);
  for (const f of findings) console.log(`${f.file}:${f.line} ${f.rule}`);
  console.log(findings.length ? `secret-scan: ${findings.length} finding(s)` : "secret-scan: clean");
  process.exit(findings.length ? 1 : 0);
}
