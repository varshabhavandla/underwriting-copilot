/** Executable evidence for claims made in docs/ASVS_SELF_ASSESSMENT.md. If one of these fails, the assessment is stale. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serverEnv } from "../../src/server-env";

const root = join(import.meta.dirname, "..", "..");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const files = [...walk(join(root, "src")), ...walk(join(root, "app"))];
const read = (f: string) => readFileSync(f, "utf8");
const offenders = (re: RegExp) => files.filter((f) => re.test(read(f))).map((f) => f.replace(root + "/", ""));

describe("static claims in the ASVS self-assessment", () => {
  it("V1.2.1/V3.2.2: no raw HTML injection in components", () => expect(offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=/)).toEqual([]));
  it("V1.3.2: no dynamic code execution", () => expect(offenders(/\beval\s*\(|new Function\s*\(/)).toEqual([]));
  it("V1.2.5: no operating system calls", () => expect(offenders(/child_process|execSync|spawnSync|execFile/)).toEqual([]));
  it("V1.2.4: raw SQL execution exists only in the migration runner", () => expect(offenders(/\.unsafe\(/)).toEqual(["src/db/migrate.ts"]));
  it("V11.5.1: no non-cryptographic randomness", () => expect(offenders(/Math\.random\(/)).toEqual([]));
  it("V14.3.3: no browser storage", () => expect(offenders(/localStorage|sessionStorage|indexedDB/)).toEqual([]));
  it("V11.3.2: only AES-256-GCM is used for encryption", () => {
    const uses = files.flatMap((f) => [...read(f).matchAll(/create(?:C|Dec)ipheriv\(\s*"([^"]+)"/g)].map((m) => m[1]));
    expect(uses.length).toBeGreaterThan(0);
    expect(new Set(uses)).toEqual(new Set(["aes-256-gcm"]));
  });
  it("V15.3.2: outbound requests do not follow redirects", () => {
    for (const f of files) for (const m of read(f).matchAll(/\bfetch\(/g)) { void m; expect(read(f)).toMatch(/redirect:\s*"error"/); }
  });
});

describe("production configuration guards (V12.3.1, V13.2.3)", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  const prod = (url: string) => { process.env = { ...saved, NODE_ENV: "production", DATABASE_URL: url }; delete process.env["DEV_TENANT_ID"]; delete process.env["DEV_USER_ID"]; return () => serverEnv(); };
  it("accepts an encrypted connection with a non-development credential", () => expect(prod("postgres://uw_app:Zk3-long-random-value@db.example.com/app?sslmode=require")).not.toThrow());
  it("refuses a connection without sslmode", () => expect(prod("postgres://uw_app:Zk3-long-random-value@db.example.com/app")).toThrow(/sslmode/));
  it("refuses sslmode=disable and prefer", () => { expect(prod("postgres://u:Zk3-long@db.example.com/app?sslmode=disable")).toThrow(/sslmode/); expect(prod("postgres://u:Zk3-long@db.example.com/app?sslmode=prefer")).toThrow(/sslmode/); });
  it("refuses development credentials", () => { expect(prod("postgres://uw_app:uw_app_dev@db.example.com/app?sslmode=require")).toThrow(/development credential/); expect(prod("postgres://u:postgres@db.example.com/app?sslmode=require")).toThrow(/development credential/); });
  it("control: the same development URL is accepted outside production", () => { process.env = { ...saved, NODE_ENV: "development", DATABASE_URL: "postgres://uw_app:uw_app_dev@127.0.0.1:54329/uw" }; expect(() => serverEnv()).not.toThrow(); });
});

describe("assessment documents are consistent", () => {
  const docs = join(root, "..", "docs");
  const lines = readFileSync(join(docs, "asvs", "ASVS_5.0.0_L2_assessment.csv"), "utf8").trim().split("\n").slice(1);
  const status = (l: string) => /,(MET|PARTIAL|NOT_MET|DEFERRED|NA|NOT_ASSESSED),/.exec(l)?.[1];
  it("every requirement has a valid status and the counts in the summary match the data", () => {
    expect(lines).toHaveLength(253);
    const c: Record<string, number> = {};
    for (const l of lines) { const s = status(l); expect(s).toBeTruthy(); c[s!] = (c[s!] ?? 0) + 1; }
    const md = readFileSync(join(docs, "ASVS_SELF_ASSESSMENT.md"), "utf8");
    const all = /\| \*\*All\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\*/.exec(md)!;
    expect([c["MET"], c["PARTIAL"], c["NOT_MET"], c["DEFERRED"], c["NA"], c["NOT_ASSESSED"]]).toEqual(all.slice(1, 7).map(Number));
  });
  it("the NIST mapping covers all 72 subcategories", () => {
    const md = readFileSync(join(docs, "NIST_AI_RMF_MAPPING.md"), "utf8");
    expect(md.split("\n").filter((l) => /^\| (GOVERN|MAP|MEASURE|MANAGE) \d\.\d+ \|/.test(l))).toHaveLength(72);
  });
});
