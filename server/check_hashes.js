import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { asc } from "drizzle-orm";
import { computeEntryHash } from "./dist/src/lib/audit.js";

async function checkEntryHashes() {
  console.log("Checking entry hash computation...");
  
  const entries = await db.query.auditLog.findMany({
    orderBy: [asc(auditLog.sequence)],
    limit: 15  // Check first 15 entries
  });
  
  let prevHash = "0".repeat(64);
  let allMatch = true;
  
  for (const e of entries) {
    const seq = e.sequence;
    const expected = computeEntryHash(prevHash, seq, e.action, e.actor, e.createdAt.getTime(), e.payload);
    const matches = expected === e.entryHash;
    
    console.log(`seq ${seq}: computed=${expected.substring(0, 8)}..., stored=${e.entryHash.substring(0, 8)}..., match=${matches}`);
    
    if (!matches) {
      console.log(`  MISMATCH at seq ${seq}!`);
      console.log(`  Expected: ${expected}`);
      console.log(`  Stored:   ${e.entryHash}`);
      console.log(`  Action:   ${e.action}`);
      console.log(`  Actor:    ${e.actor}`);
      console.log(`  Payload:  ${JSON.stringify(e.payload).substring(0, 100)}...`);
      allMatch = false;
      break;
    }
    
    prevHash = e.entryHash;
  }
  
  console.log(`\\nAll entry hashes match: ${allMatch}`);
  await db.end();
}

checkEntryHashes().catch(console.error);