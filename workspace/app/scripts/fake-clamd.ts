/** Starts the fake ClamAV daemon for local development and end-to-end tests: `npx tsx scripts/fake-clamd.ts <port>`. It only recognizes the EICAR test string. */
import { startFakeClamd } from "../test/support/fakeClamd";

const c = await startFakeClamd(Number(process.argv[2] ?? 3310));
console.log(`fake clamd on ${c.port}`);
