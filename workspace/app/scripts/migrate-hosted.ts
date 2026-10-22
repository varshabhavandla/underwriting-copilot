/** Applies the forward-only migrations to a hosted database as the owner role. Usage: OWNER_DATABASE_URL=postgres://uw_owner:...@host/db npm run db:migrate */
import { connect } from "../src/db/client";
import { migrate } from "../src/db/migrate";

const url = process.env["OWNER_DATABASE_URL"];
if (!url) throw new Error("set OWNER_DATABASE_URL (the owner role, never the application role)");
const owner = connect(url, 1);
try {
  const applied = await migrate(owner);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "nothing to apply: already up to date");
} finally {
  await owner.end();
}
