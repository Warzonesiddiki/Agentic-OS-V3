import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { asc, eq } from "drizzle-orm";
import { computeEntryHash, GENESIS_HASH } from "./dist/src/lib/audit.js";

async function rebuildAuditChain() {
  console.log("Rebuilding entire audit chain...");
  
  // Get all entries ordered by sequence
  const entries = await db.query.auditLog.findMany({
    orderBy: [asc(auditLog.sequence)]
  });
  
  console.log(`Found ${entries.length} entries to process`);
  
  let prevHash = GENESIS_HASH;
  let fixedCount = 0;
  
  // Process entries in order, updating both prevHash and entryHash
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const seq = e.sequence;
    
    // Check if prevHash needs fixing
    if (e.prevHash !== prevHash) {
      console.log(`Entry ${seq}: fixing prevHash`);
      await db.update(auditLog)
        .set({ prevHash })
        .where(eq(auditLog.sequence, seq));
      fixedCount++;
    }
    
    // Compute what the entryHash should be
    const expectedHash = computeEntryHash(
      prevHash,
      seq,
      e.action,
      e.actor,
      e.createdAt.getTime(),
      e.payload
    );
    
    // Check if entryHash needs fixing
    if (expectedHash !== e.entryHash) {
      console.log(`Entry ${seq}: fixing entryHash`);
      await db.update(auditLog)
        .set({ entryHash: expectedHash })
        .where(eq(auditLog.sequence, seq));
      fixedCount++;
    }
    
    // Update prevHash for next iteration
    prevHash = expectedHash;
  }
  
  console.log(`\\nFixed ${fixedCount} values across ${entries.length} entries!`);
  
  // Verify the fix
  console.log("\\nVerifying audit chain...");
  const { verifyAuditChain } = await import("./dist/src/lib/audit.js");
  const result = await verifyAuditChain();
  console.log("Verification result:", result);
  
  await db.end();
}

rebuildAuditChain().catch(console.error);