import { db } from "./dist/src/db/client.js";
import { apiKeys } from "./dist/src/db/schema.js";
import { eq } from "drizzle-orm";
import { generateApiKey, hashApiKey, authenticate } from "./dist/src/lib/security.js";
import { randomUUID } from "node:crypto";

async function debugScopeTest() {
  console.log("Debugging scope enforcement test...");
  
  // Create a read-only key (same as the test)
  const roKey = generateApiKey();
  console.log(`Generated key: ${roKey}`);
  
  const keyHash = hashApiKey(roKey);
  console.log(`Key hash: ${keyHash}`);
  
  // Insert it into the database
  await db.insert(apiKeys).values({
    id: `prn_${randomUUID()}`,
    name: "reader",
    keyHash: keyHash,
    scopes: ["memory:read"],
    status: "active",
  });
  
  console.log("Key inserted into database");
  
  // Try to authenticate with the key
  console.log("\\nAuthenticating with the key...");
  const principal = await authenticate(db, roKey);
  
  if (principal) {
    console.log("✅ Authentication successful!");
    console.log(`Principal: ${JSON.stringify(principal, null, 2)}`);
  } else {
    console.log("❌ Authentication failed - principal is null");
  }
  
  // Check if the key exists in the database
  console.log("\\nChecking if key exists in database...");
  const allKeys = await db.query.apiKeys.findMany();
  console.log(`Found ${allKeys.length} keys in database:`);
  allKeys.forEach(k => {
    console.log(`  - ${k.name}: ${k.scopes.join(", ")})`);
  });
  
  // Try to verify the key manually
  console.log("\\nManual key verification:");
  const verifyResult = hashApiKey(roKey) === keyHash;
  console.log(`Key verification: ${verifyResult}`);
  
  await db.end();
}

debugScopeTest().catch(console.error);