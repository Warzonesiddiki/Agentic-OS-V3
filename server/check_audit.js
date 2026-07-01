import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { desc } from "drizzle-orm";

async function main() {
  const entries = await db.query.auditLog.findMany({
    orderBy: [desc(auditLog.sequence)],
    limit: 15
  });
  
  console.log("Recent audit entries (newest first):");
  entries.forEach(e => {
    console.log(`seq=${e.sequence}, prevHash=${e.prevHash.substring(0, 8)}..., entryHash=${e.entryHash.substring(0, 8)}..., action=${e.action}, actor=${e.actor}`);
  });
  
  // Check the chain manually for the first few entries
  console.log("\nManual chain verification:");
  const all = await db.query.auditLog.findMany({
    orderBy: [auditLog.sequence]
  });
  
  let prevHash = "0".repeat(64);
  for (const e of all) {
    const seq = e.sequence;
    const matches = e.prevHash === prevHash;
    console.log(`seq ${seq}: prevHash matches? ${matches} (expected ${prevHash.substring(0, 8)}..., got ${e.prevHash.substring(0, 8)}...)`);
    if (!matches) {
      console.log(`  BROKEN at sequence ${seq}`);
      break;
    }
    prevHash = e.entryHash;
  }
  
  await db.end();
}

main().catch(console.error);