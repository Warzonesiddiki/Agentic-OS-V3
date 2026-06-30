/**
 * Federated-recall unit tests — pure functions only, no database required.
 * Tests canonicalization, budget tracking, materialization decisions,
 * and signature verification (using actual crypto).
 */
import { describe, it, expect } from "vitest";
import {
  canonicalizeProof, verifyMemoryProofSignature,
  consumeBudget, refundBudget, privacyBudgetForTopic,
  decideMaterialization, publishMemoryProof,
  type MemoryProof,
} from "../src/services/federated-recall.js";

const SAMPLE_PROOF: Omit<MemoryProof, "signature"> = {
  origin_peer_id: "peer_abc123",
  origin_pubkey: "dGVzdHB1YmtleQ==",
  content_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  embedding: [0.1, 0.2, 0.3],
  topic_tags: ["llm", "test"],
  importance: 0.7,
  privacy_class: "public",
  ttl_seconds: 3600,
};

describe("federated-recall — canonicalizeProof", () => {
  it("produces stable JSON with fixed key order", () => {
    const result = canonicalizeProof(SAMPLE_PROOF);
    const parsed = JSON.parse(result);
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe("origin_peer_id");
    expect(keys[1]).toBe("origin_pubkey");
    expect(keys[2]).toBe("content_sha256");
    expect(keys[3]).toBe("embedding");
    expect(keys[4]).toBe("topic_tags");
  });

  it("is deterministic (same input = same output)", () => {
    const a = canonicalizeProof(SAMPLE_PROOF);
    const b = canonicalizeProof({ ...SAMPLE_PROOF });
    expect(a).toBe(b);
  });

  it("changes when any field changes", () => {
    const a = canonicalizeProof(SAMPLE_PROOF);
    const b = canonicalizeProof({ ...SAMPLE_PROOF, importance: 0.3 });
    expect(a).not.toBe(b);
  });
});

describe("federated-recall — budget tracking", () => {
  it("consumeBudget returns true for first request", () => {
    const result = consumeBudget("test-topic-" + Date.now());
    expect(result).toBe(true);
  });

  it("consumeBudget returns false when exhausted", () => {
    const topic = "exhaust-topic-" + Date.now();
    const limit = privacyBudgetForTopic(topic);
    for (let i = 0; i < limit; i++) {
      consumeBudget(topic);
    }
    expect(consumeBudget(topic)).toBe(false);
  });

  it("refundBudget reduces count", () => {
    const topic = "refund-topic-" + Date.now();
    consumeBudget(topic);
    refundBudget(topic);
    expect(consumeBudget(topic)).toBe(true);
  });
});

describe("federated-recall — privacyBudgetForTopic", () => {
  it("returns default budget when no env override", () => {
    const budget = privacyBudgetForTopic("random-topic");
    expect(budget).toBe(100);
  });

  it("respects env override", () => {
    const topic = "custom";
    const envKey = `NEXUS_FED_BUDGET_CUSTOM`;
    const orig = process.env[envKey];
    try {
      process.env[envKey] = "10";
      const budget = privacyBudgetForTopic(topic);
      expect(budget).toBe(10);
    } finally {
      if (orig === undefined) delete process.env[envKey];
      else process.env[envKey] = orig;
    }
  });

  it("rejects invalid env override with default", () => {
    const topic = "invalid-override";
    const envKey = `NEXUS_FED_BUDGET_INVALID_OVERRIDE`;
    const orig = process.env[envKey];
    try {
      process.env[envKey] = "not-a-number";
      const budget = privacyBudgetForTopic(topic);
      expect(budget).toBe(100);
    } finally {
      if (orig === undefined) delete process.env[envKey];
      else process.env[envKey] = orig;
    }
  });
});

describe("federated-recall — decideMaterialization", () => {
  it("allows public proofs with sufficient importance and tags", async () => {
    const result = await decideMaterialization({
      ...SAMPLE_PROOF, signature: "",
    });
    expect(result.materialize).toBe(true);
  });

  it("denies private proofs", async () => {
    const result = await decideMaterialization({
      ...SAMPLE_PROOF, signature: "", privacy_class: "private",
    });
    expect(result.materialize).toBe(false);
    expect(result.reason).toContain("private");
  });

  it("denies proofs below importance threshold", async () => {
    const result = await decideMaterialization({
      ...SAMPLE_PROOF, signature: "", importance: 0.05,
    });
    expect(result.materialize).toBe(false);
    expect(result.reason).toContain("importance");
  });

  it("denies proofs with no topic tags", async () => {
    const result = await decideMaterialization({
      ...SAMPLE_PROOF, signature: "", topic_tags: [],
    });
    expect(result.materialize).toBe(false);
    expect(result.reason).toContain("topic");
  });
});

describe("federated-recall — signature round trip", () => {
  it("generates and verifies a proof signature", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "der" },
      publicKeyEncoding: { type: "spki", format: "der" },
    });
    const privKeyB64 = privateKey.toString("base64");

    const proof = await publishMemoryProof({
      peerId: "test-peer",
      publisherPrivKeyB64: privKeyB64,
      contentSha256: "abc123",
      embedding: [0.1, 0.2],
      topicTags: ["test"],
      importance: 0.5,
      privacyClass: "public",
    });

    expect(proof.signature).toBeTruthy();
    expect(proof.origin_peer_id).toBe("test-peer");
    expect(proof.content_sha256).toBe("abc123");

    const valid = verifyMemoryProofSignature(proof);
    expect(valid).toBe(true);
  });

  it("rejects tampered proofs", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "der" },
      publicKeyEncoding: { type: "spki", format: "der" },
    });
    const privKeyB64 = privateKey.toString("base64");

    const proof = await publishMemoryProof({
      peerId: "test-peer",
      publisherPrivKeyB64: privKeyB64,
      contentSha256: "abc123",
      embedding: [0.1],
      topicTags: ["test"],
      importance: 0.5,
      privacyClass: "public",
    });

    proof.content_sha256 = "tampered-content";

    const valid = verifyMemoryProofSignature(proof);
    expect(valid).toBe(false);
  });
});
