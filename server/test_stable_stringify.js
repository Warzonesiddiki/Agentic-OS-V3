import { stableStringify } from "./dist/src/lib/audit.js";

// Test the stableStringify function with the problematic payload
const payload = {
  type: "input",
  score: 1,
  action: "block",
  details: ["Pattern 'sql_injection' matched: DROP TABLE"]
};

console.log("Original payload:", JSON.stringify(payload, null, 2));
console.log("\\nStable stringified:", stableStringify(payload));

// Test with a simpler payload
const simplePayload = { type: "input", score: 1 };
console.log("\\nSimple payload:", JSON.stringify(simplePayload, null, 2));
console.log("Stable stringified:", stableStringify(simplePayload));

// Test if the order of keys matters
const reorderedPayload = {
  score: 1,
  action: "block",
  type: "input",
  details: ["Pattern 'sql_injection' matched: DROP TABLE"]
};
console.log("\\nReordered payload:", JSON.stringify(reorderedPayload, null, 2));
console.log("Stable stringified:", stableStringify(reorderedPayload));
console.log("\\nShould be identical to original:", stableStringify(payload) === stableStringify(reorderedPayload));