import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function testExactTimestamp() {
  console.log("Fetching exact entry 11 data...");
  
  const entry11 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 11)
  });
  
  const entry10 = await db.query.auditLog.findFirst({
    where: (t, { eq }) => eq(t.sequence, 10)
  });
  
  console.log("Entry 11 createdAt (exact):");
  console.log(`  Date object: ${entry11.createdAt}`);
  console.log(`  getTime(): ${entry11.createdAt.getTime()}`);
  console.log(`  ISO string: ${entry11.createdAt.toISOString()}`);
  
  // Try computing with the exact timestamp from the DB
  const computedHash = computeEntryHash(
    entry10.entryHash,
    entry11.sequence,
    entry11.action,
    entry11.actor,
    entry11.createdAt.getTime(),  // Use the exact timestamp from DB
    entry11.payload
  );
  
  console.log(`\\nComputed hash: ${computedHash}`);
  console.log(`Stored hash:   ${entry11.entryHash}`);
  console.log(`Match: ${computedHash === entry11.entryHash}`);
  
  // Also try with a Date object created from the ISO string
  const dateFromIso = new Date(entry11.createdAt.toISOString());
  console.log(`\\nDate from ISO: ${dateFromIso.getTime()}`);
  console.log(`Original date: ${entry11.createdAt.getTime()}`);
  console.log(`Same millisecond? ${dateFromIso.getTime() === entry11.createdAt.getTime()}`);
  
  await db.end();
}

testExactTimestamp().catch(console.error);