import { db } from "./dist/src/db/client.js";
import { auditLog } from "./dist/src/db/schema.js";
import { asc, desc } from "drizzle-orm";

async function debugVerify() {
  const PAGE = 1000;
  let prevHash = "0".repeat(64);
  let verified = 0;
  let total = 0;
  let after = 0;
  
  console.log("Starting verification loop...");
  
  for (;;) {
    console.log(`\\nFetching page with after=${after}`);
    const page = await db.query.auditLog.findMany({
      orderBy: [asc(auditLog.sequence), asc(auditLog.id)],
      where: (t, { gt }) => gt(t.sequence, after),
      limit: PAGE,
    });
    
    console.log(`Got ${page.length} entries in this page`);
    if (!page.length) break;
    
    for (const e of page) {
      const seq = e.sequence;
      console.log(`  Checking seq ${seq}: prevHash=${e.prevHash.substring(0, 8)}..., expected=${prevHash.substring(0, 8)}...`);
      
      if (e.prevHash !== prevHash) {
        console.log(`  BROKEN: prevHash mismatch at seq ${seq}`);
        return { valid: false, verifiedEntries: verified, brokenAt: seq, total };
      }
      
      // For simplicity, skip the full entry hash verification
      // Just check the prevHash chain
      
      prevHash = e.entryHash;
      verified++;
      total++;
    }
    
    console.log(`After processing page: verified=${verified}, total=${total}`);
    after = page[page.length - 1].sequence;
    console.log(`Setting after=${after}`);
    
    if (page.length < PAGE) {
      console.log("Page smaller than PAGE size, breaking");
      break;
    }
  }
  
  console.log(`\\nLoop completed: verified=${verified}, total=${total}`);
  
  // Check Merkle checkpoints
  console.log("\\nChecking Merkle checkpoints...");
  const checkpoints = await db.query.merkleCheckpoints.findMany({
    orderBy: [asc(merkleCheckpoints.chunkEndSeq)],
  });
  console.log(`Found ${checkpoints.length} checkpoints`);
  
  if (checkpoints.length === 0) {
    console.log("No checkpoints, verification should succeed");
    return { valid: true, verifiedEntries: verified, brokenAt: null, total };
  }
  
  return { valid: true, verifiedEntries: verified, brokenAt: null, total };
}

debugVerify().catch(console.error);