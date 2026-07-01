import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { eq } from "drizzle-orm";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function fixAuditChain() {
  console.log("Fixing audit chain...");
  
  // Get entry 10 (to get the prevHash for entry 11)
  const entry10 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 10)
  });
  
  // Get entry 11
  const entry11 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 11)
  });
  
  console.log(`Entry 10 hash: ${entry10.entryHash}`);
  console.log(`Entry 11 current hash: ${entry11.entryHash}`);
  
  // Compute the correct hash for entry 11
  const correctHash = computeEntryHash(
    entry10.entryHash,
    entry11.sequence,
    entry11.action,
    entry11.actor,
    entry11.createdAt.getTime(),
    entry11.payload
  );
  
  console.log(`Correct hash for entry 11: ${correctHash}`);
  
  // Update entry 11 with the correct hash
  console.log("\\nUpdating entry 11...");
  await db.update(auditLog)
    .set({ entryHash: correctHash })
    .where(eq(auditLog.sequence, 11));
  
  console.log("Entry 11 updated!");
  
  // Verify the fix
  console.log("\\nVerifying audit chain...");
  const { verifyAuditChain } = await import("./dist/src/lib/audit.js");
  const result = await verifyAuditChain();
  console.log("Verification result:", result);
  
  await db.end();
}

fixAuditChain().catch(console.error);