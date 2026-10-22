/** Creates a fresh, migrated database with one tenant and one underwriter. Prints TENANT=<id> and USER=<id>. Usage: tsx scripts/setup-db.ts <dbname> */
import { setupDatabase } from "./lib/setupDb";

const admin = process.env["UW_TEST_ADMIN_URL"];
const db = process.argv[2];
if (!admin || !db) throw new Error("usage: UW_TEST_ADMIN_URL=... tsx scripts/setup-db.ts <dbname>");
const r = await setupDatabase(admin, db);
console.log(`TENANT=${r.tenant}\nUSER=${r.user}`);
