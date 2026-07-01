import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { eq } from "drizzle-orm";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function inspectEntry12() {
  console.log("Fetching entry 11 and 12...");
  
  const entry11 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 11)
  });
  
  const entry12 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 12)
  });
  
  console.log(`Entry 11 hash: ${entry11.entryHash}`);
  console.log(`Entry 12 prevHash: ${entry12.prevHash}`);
  console.log(`Entry 12 hash: ${entry12.entryHash}`);
  
  console.log(`\\nPrevHash match: ${entry12.prevHash === entry11.entryHash}`);
  
  // Compute what entry 12's hash should be
  const expectedHash = computeEntryHash(
    entry11.entryHash,  // This should be entry 12's prevHash
    entry12.sequence,
    entry12.action,
    entry12.actor,
    entry12.createdAt.getTime(),
    entry12.payload
  );
  
  console.log(`Expected hash for entry 12: ${expectedHash}`);
  console.log(`Stored hash for entry 12: ${entry12.entryHash}`);
  console.log(`Hash match: ${expectedHash === entry12.entryHash}`);
  
  await db.end();
}

inspectEntry12().catch(console.error);