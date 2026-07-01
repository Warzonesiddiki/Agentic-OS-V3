import { db } from "./dist/src/db/client.js";
import { merkleCheckpoints } from "./dist/src/db/schema.js";
import { asc } from "drizzle-orm";

async function main() {
  console.log("Checking Merkle checkpoints...");
  const checkpoints = await db.query.merkleCheckpoints.findMany({
    orderBy: [asc(merkleCheckpoints.chunkEndSeq)],
  });
  
  console.log(`Found ${checkpoints.length} checkpoints:`);
  checkpoints.forEach(cp => {
    console.log(`  chunk ${cp.chunkStartSeq}-${cp.chunkEndSeq}, root=${cp.merkleRoot.substring(0, 8)}..., prev=${cp.prevCheckpointHash.substring(0, 8)}...`);
  });
  
  // Check if the first checkpoint's prevCheckpointHash matches GENESIS_HASH
  if (checkpoints.length > 0) {
    const firstCp = checkpoints[0];
    const genesisHash = "0".repeat(64);
    const matches = firstCp.prevCheckpointHash === genesisHash;
    console.log(`\nFirst checkpoint prevCheckpointHash matches GENESIS? ${matches}`);
    console.log(`Expected: ${genesisHash.substring(0, 8)}...`);
    console.log(`Got: ${firstCp.prevCheckpointHash.substring(0, 8)}...`);
  }
  
  await db.end();
}

main().catch(console.error);