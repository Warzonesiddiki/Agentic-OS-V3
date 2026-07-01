import { computeEntryHash } from "./dist/src/lib/audit.js";

// The payload from the database (with guardrail field)
const dbPayload = {
  type: "input",
  score: 1,
  action: "block",
  details: ["Pattern 'sql_injection' matched: DROP TABLE"],
  guardrail: "pattern_check"
};

// The payload I tested earlier (without guardrail field)
const testPayload = {
  type: "input",
  score: 1,
  action: "block",
  details: ["Pattern 'sql_injection' matched: DROP TABLE"]
};

const prevHash = "fc98feebb71aff28eedfd07a8e78835a7258d87c6c7ec4c3218eadc5238ddf1e";
const sequence = 11;
const action = "guardrail.violation";
const actor = "guardrails";
const createdAtMs = new Date("Tue Jun 30 2026 23:59:44 GMT+0530").getTime();

console.log("Computing hash with DB payload (with guardrail field):");
const hashWithGuardrail = computeEntryHash(prevHash, sequence, action, actor, createdAtMs, dbPayload);
console.log(`Hash: ${hashWithGuardrail}`);

console.log("\\nComputing hash with test payload (without guardrail field):");
const hashWithoutGuardrail = computeEntryHash(prevHash, sequence, action, actor, createdAtMs, testPayload);
console.log(`Hash: ${hashWithoutGuardrail}`);

console.log("\\nStored hash from DB:");
console.log("d3d1b84b7d6af87b869c929021d8eac58e358857a5b78260e114f8664e27f9e2");

console.log("\\nDoes DB payload match stored hash?");
console.log(hashWithGuardrail === "d3d1b84b7d6af87b869c929021d8eac58e358857a5b78260e114f8664e27f9e2");

console.log("\\nDoes test payload match stored hash?");
console.log(hashWithoutGuardrail === "d3d1b84b7d6af87b869c929021d8eac58e358857a5b78260e114f8664e27f9e2");