// Deletes the local data store; the app re-seeds demo data on next start.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.env.MOVEON_DATA_DIR ?? "data");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Demo data will be re-seeded on next request.`);
