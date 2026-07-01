import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { asc } from "drizzle-orm";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function findAllBadEntries() {
  console.log("Finding all entries with incorrect hashes...");
  
  const entries = await db.query.auditLog.findMany({
    orderBy: [asc(auditLog.sequence)]
  });
  
  let prevHash = "0".repeat(64);
  const badEntries = [];
  
  for (const e of entries) {
    const seq = e.sequence;
    const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
    
    if (expected !== e.entryHash) {
      badEntries.push({
        sequence: seq,
        expectedHash: expected,
        storedHash: e.entryHash,
        action: e.action,
        actor: e.actor
      });
      console.log(`Entry ${seq}: MISMATCH`);
      console.log(`  Expected: ${expected.substring(0, 16)}...`);
      console.log(`  Stored:   ${e.entryHash.substring(0, 16)}...`);
    } else {
      console.log(`Entry ${seq}: OK`);
    }
    
    prevHash = e.entryHash;
  }
  
  console.log(`\\nFound ${badEntries.length} entries with incorrect hashes:`);
  badEntries.forEach(b => {
    console.log(`  seq ${b.sequence}: ${b.action} by ${b.actor}`);
  });
  
  await db.end();
  return badEntries;
}

findAllBadEntries().catch(console.error);