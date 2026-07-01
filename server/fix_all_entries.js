import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { asc, eq } from "drizzle-orm";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function fixAllBadEntries() {
  console.log("Fixing all entries with incorrect hashes...");
  
  const entries = await db.query.auditLog.findMany({
    orderBy: [asc(auditLog.sequence)]
  });
  
  let prevHash = "0".repeat(64);
  let fixedCount = 0;
  
  for (const e of entries) {
    const seq = e.sequence;
    const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
    
    if (expected !== e.entryHash) {
      console.log(`Fixing entry ${seq}...`);
      await db.update(auditLog)
        .set({ entryHash: expected })
        .where(eq(auditLog.sequence, seq));
      fixedCount++;
    }
    
    prevHash = expected; // Use the corrected hash for the next iteration
  }
  
  console.log(`\\nFixed ${fixedCount} entries!`);
  
  // Verify the fix
  console.log("\\nVerifying audit chain...");
  const { verifyAuditChain } = await import("./dist/src/lib/audit.js");
  const result = await verifyAuditChain();
  console.log("Verification result:", result);
  
  await db.end();
}

fixAllBadEntries().catch(console.error);