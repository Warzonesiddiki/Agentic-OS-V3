import { db } from "./dist/src/db/client.js";
import { verifyAuditChain } from "./dist/src/lib/audit.js";

async function main() {
  console.log("Calling verifyAuditChain()...");
  const result = await verifyAuditChain();
  console.log("Result:", JSON.stringify(result, null, 2));
  
  // Also check the fast version
  console.log("\nCalling verifyAuditChainFast()...");
  const { verifyAuditChainFast } = await import("./dist/src/lib/audit.js");
  const fastResult = await verifyAuditChainFast();
  console.log("Fast result:", JSON.stringify(fastResult, null, 2));
  
  await db.end();
}

main().catch(console.error);