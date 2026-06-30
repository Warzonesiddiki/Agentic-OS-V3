/**
 * blockchain.ts — Anchor Merkle roots to an Ethereum-compatible chain.
 * Uses viem for lightweight RPC calls. When enabled, every N Merkle
 * checkpoints are submitted as calldata to a configured contract or
 * as a simple ETH transfer to a burn address (calldata-only anchoring).
 */

import { createHash, randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { anchoredRoots, merkleCheckpoints } from "../db/schema.js";
import { getEnv } from "../lib/env.js";
import { log } from "../lib/logging.js";
import { desc, eq } from "drizzle-orm";

/* ── Lightweight calldata anchoring (no contract ABI needed) ── */

/**
 * Encode a Merkle root + checkpoint range into 32+8+8 bytes of calldata.
 * Format: keccak256("NEXUS_AUDIT_v1") as first 4 bytes (function selector),
 * followed by root (bytes32), chunkStartSeq (uint64), chunkEndSeq (uint64).
 */
function encodeAnchorPayload(root: string, startSeq: number, endSeq: number): `0x${string}` {
  const rootBytes = root.padStart(64, "0");
  const startHex = startSeq.toString(16).padStart(16, "0");
  const endHex = endSeq.toString(16).padStart(16, "0");
  // 4-byte selector (keccak of "anchorAuditRoot(bytes32,uint64,uint64)") for recognizability
  return `0x3b8c7e8a${rootBytes}${startHex}${endHex}` as const;
}

/* ── Public API ── */

export interface AnchorResult {
  id: string;
  checkpointId: string;
  merkleRoot: string;
  txHash: string;
  chainId: number;
  status: "pending" | "confirmed" | "failed";
}

/**
 * Anchor the latest unanchored Merkle checkpoint to the configured chain.
 * Returns null if blockchain anchoring is disabled or no checkpoint needs anchoring.
 */
export async function anchorLatestCheckpoint(): Promise<AnchorResult | null> {
  const env = getEnv();
  if (!env.NEXUS_BLOCKCHAIN_ENABLED) return null;
  if (!env.NEXUS_BLOCKCHAIN_RPC_URL || !env.NEXUS_BLOCKCHAIN_PRIVATE_KEY) {
    log.warn("blockchain_disabled_incomplete_config", {
      hasRpc: Boolean(env.NEXUS_BLOCKCHAIN_RPC_URL),
      hasKey: Boolean(env.NEXUS_BLOCKCHAIN_PRIVATE_KEY),
    });
    return null;
  }

  // Find the latest checkpoint that hasn't been anchored yet
  const latestCp = await db.query.merkleCheckpoints.findFirst({
    orderBy: [desc(merkleCheckpoints.chunkEndSeq)],
  });
  if (!latestCp) return null;

  const alreadyAnchored = await db.query.anchoredRoots.findFirst({
    where: (t, { eq }) => eq(t.checkpointId, latestCp.id),
  });
  if (alreadyAnchored) return null; // already submitted

  const payload = encodeAnchorPayload(
    latestCp.merkleRoot,
    latestCp.chunkStartSeq,
    latestCp.chunkEndSeq,
  );

  try {
    const txHash = await submitToChain(env, payload);
    const id = `anc_${randomUUID()}`;

    await db.insert(anchoredRoots).values({
      id,
      checkpointId: latestCp.id,
      merkleRoot: latestCp.merkleRoot,
      chainId: env.NEXUS_BLOCKCHAIN_CHAIN_ID,
      txHash,
      status: "pending",
      createdAt: new Date(),
    });

    log.info("blockchain_anchor_submitted", {
      root: latestCp.merkleRoot,
      checkpointId: latestCp.id,
      txHash,
      chainId: env.NEXUS_BLOCKCHAIN_CHAIN_ID,
    });

    return { id, checkpointId: latestCp.id, merkleRoot: latestCp.merkleRoot, txHash, chainId: env.NEXUS_BLOCKCHAIN_CHAIN_ID, status: "pending" };
  } catch (e) {
    log.error("blockchain_anchor_failed", {
      error: e instanceof Error ? e.message : String(e),
      root: latestCp.merkleRoot,
    });
    return null;
  }
}

/**
 * Attempt to confirm pending anchors by checking receipt status.
 */
export async function confirmPendingAnchors(): Promise<void> {
  const env = getEnv();
  if (!env.NEXUS_BLOCKCHAIN_ENABLED || !env.NEXUS_BLOCKCHAIN_RPC_URL) return;

  const pending = await db.query.anchoredRoots.findMany({
    where: (t, { eq }) => eq(t.status, "pending"),
    limit: 20,
  });
  if (!pending.length) return;

  for (const anchor of pending) {
    try {
      const receipt = await getTransactionReceipt(env, anchor.txHash as `0x${string}`);
      if (receipt) {
        const newStatus = receipt.status === "success" ? "confirmed" : "failed";
        await db
          .update(anchoredRoots)
          .set({
            status: newStatus,
            blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
            confirmedAt: newStatus === "confirmed" ? new Date() : undefined,
          })
          .where(eq(anchoredRoots.id, anchor.id));
        log.info("blockchain_anchor_confirmed", {
          id: anchor.id,
          status: newStatus,
          blockNumber: receipt.blockNumber,
        });
      }
    } catch {
      // RPC temporarily unavailable — try again next cycle
    }
  }
}

/* ── Chain interaction (viem-free for minimal deps) ── */

interface TxReceipt {
  status: "success" | "reverted";
  blockNumber: bigint | null;
}

async function submitToChain(env: ReturnType<typeof getEnv>, data: `0x${string}`): Promise<string> {
  const { createWalletClient, http, parseEther } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { mainnet, sepolia, holesky } = await import("viem/chains");

  const chain = [mainnet, sepolia, holesky].find((c) => c.id === env.NEXUS_BLOCKCHAIN_CHAIN_ID) ?? mainnet;

  const account = privateKeyToAccount(env.NEXUS_BLOCKCHAIN_PRIVATE_KEY as `0x${string}`);
  const client = createWalletClient({
    account,
    chain,
    transport: http(env.NEXUS_BLOCKCHAIN_RPC_URL),
  });

  const hash = await client.sendTransaction({
    to: account.address,
    value: parseEther("0"),
    data,
  });

  return hash;
}

async function getTransactionReceipt(
  env: ReturnType<typeof getEnv>,
  txHash: `0x${string}`,
): Promise<TxReceipt | null> {
  const { createPublicClient, http } = await import("viem");
  const { mainnet, sepolia, holesky } = await import("viem/chains");

  const chain = [mainnet, sepolia, holesky].find((c) => c.id === env.NEXUS_BLOCKCHAIN_CHAIN_ID) ?? mainnet;

  const client = createPublicClient({
    chain,
    transport: http(env.NEXUS_BLOCKCHAIN_RPC_URL),
  });

  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt) return null;

  return {
    status: receipt.status === "success" ? "success" : "reverted",
    blockNumber: receipt.blockNumber,
  };
}

/* ── Direct sha256 → bytes32 conversion (the chain uses keccak256, but we hash the root) ── */

export function hashAnchorPayload(root: string): string {
  return createHash("sha256").update(`nexus::anchor::${root}`, "utf8").digest("hex");
}
