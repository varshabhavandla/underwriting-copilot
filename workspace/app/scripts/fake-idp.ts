/** Starts the fake identity provider for local development: `npx tsx scripts/fake-idp.ts <port> <clientId> <clientSecret> <redirectUri> <sub:label>...` (development only). */
import { startFakeIdp } from "../test/support/fakeIdp";

const [port, clientId, clientSecret, redirectUri, ...users] = process.argv.slice(2);
if (!port || !clientId || !clientSecret || !redirectUri || users.length === 0) throw new Error("usage: fake-idp <port> <clientId> <clientSecret> <redirectUri> <sub:label>...");
const idp = await startFakeIdp({ port: Number(port), clientId, clientSecret, redirectUri, users: users.map((u) => { const i = u.indexOf(":"); return { sub: u.slice(0, i), label: u.slice(i + 1) }; }) });
console.log(`fake identity provider at ${idp.issuer}`);
