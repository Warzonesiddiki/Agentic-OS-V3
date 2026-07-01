import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function inspectEntry11() {
  console.log("Fetching entry 11...");
  
  const entry11 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 11)
  });
  
  const entry10 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 10)
  });
  
  console.log("\\nEntry 10 (previous):");
  console.log(`  sequence: ${entry10.sequence}`);
  console.log(`  entryHash: ${entry10.entryHash}`);
  console.log(`  action: ${entry10.action}`);
  console.log(`  actor: ${entry10.actor}`);
  console.log(`  createdAt: ${entry10.createdAt}`);
  console.log(`  payload: ${JSON.stringify(entry10.payload)}`);
  
  console.log("\\nEntry 11 (problematic):");
  console.log(`  sequence: ${entry11.sequence}`);
  console.log(`  prevHash: ${entry11.prevHash}`);
  console.log(`  entryHash: ${entry11.entryHash}`);
  console.log(`  action: ${entry11.action}`);
  console.log(`  actor: ${entry11.actor}`);
  console.log(`  createdAt: ${entry11.createdAt}`);
  console.log(`  payload: ${JSON.stringify(entry11.payload)}`);
  
  console.log("\\nComputing expected hash for entry 11...");
  const expectedHash = computeEntryHash(
    entry10.entryHash,  // prevHash should be entry10's entryHash
    entry11.sequence,
    entry11.action,
    entry11.actor,
    entry11.createdAt.getTime(),
    entry11.payload
  );
  
  console.log(`Expected: ${expectedHash}`);
  console.log(`Stored:   ${entry11.entryHash}`);
  console.log(`Match: ${expectedHash === entry11.entryHash}`);
  
  // Also check if prevHash matches entry10's entryHash
  console.log(`\\nPrevHash check:`);
  console.log(`Entry11.prevHash: ${entry11.prevHash}`);
  console.log(`Entry10.entryHash: ${entry10.entryHash}`);
  console.log(`Match: ${entry11.prevHash === entry10.entryHash}`);
  
  await db.end();
}

inspectEntry11().catch(console.error);