// queues/itemSyncQueue.js
import { Queue } from "bullmq";
import { randomUUID } from "crypto";
import connection from "../config/redis.js";

export const ITEM_SYNC_QUEUE = "item-sync-queue";

export const itemSyncQueue = new Queue(ITEM_SYNC_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 }, // keep 1hr / last 1000
    removeOnFail: { age: 86400 }, // keep failures for 1 day for debugging
  },
});

const CHUNK_SIZE = 400; // matches prior in-request bulkWrite chunk size
const BATCH_TTL_SECONDS = 60 * 60 * 6; // 6 hours

function batchKey(batchId) {
  return `item-sync:batch:${batchId}`;
}

/**
 * Splits normalized items into chunks and enqueues one job per chunk.
 * Writes a batch-status hash in Redis that the worker updates as chunks complete.
 * Returns { batch_id, total_chunks, total_items }
 */
export async function enqueueItemSyncBatch(normalizedItems, meta = {}) {
  const batch_id = randomUUID();
  const chunks = [];

  for (let i = 0; i < normalizedItems.length; i += CHUNK_SIZE) {
    chunks.push(normalizedItems.slice(i, i + CHUNK_SIZE));
  }

  const key = batchKey(batch_id);

  await connection.hset(key, {
    batch_id,
    status: "queued",
    total_chunks: chunks.length,
    completed_chunks: 0,
    failed_chunks: 0,
    total_items: normalizedItems.length,
    matched: 0,
    modified: 0,
    upserted: 0,
    errors: JSON.stringify([]),
    comp_codes: JSON.stringify(meta.comp_codes || []),
    created_at: Date.now(),
    updated_at: Date.now(),
  });
  await connection.expire(key, BATCH_TTL_SECONDS);

  // Enqueue all chunk jobs tagged with the batch id
  await itemSyncQueue.addBulk(
    chunks.map((chunk, index) => ({
      name: "sync-item-chunk",
      data: {
        batch_id,
        chunk_index: index,
        items: chunk,
      },
    }))
  );

  return {
    batch_id,
    total_chunks: chunks.length,
    total_items: normalizedItems.length,
  };
}

export async function getBatchStatus(batch_id) {
  const key = batchKey(batch_id);
  const data = await connection.hgetall(key);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  const total_chunks = Number(data.total_chunks || 0);
  const completed_chunks = Number(data.completed_chunks || 0);
  const failed_chunks = Number(data.failed_chunks || 0);

  let status = data.status || "queued";
  if (completed_chunks + failed_chunks >= total_chunks && total_chunks > 0) {
    status = failed_chunks > 0 ? "completed_with_errors" : "completed";
  } else if (completed_chunks + failed_chunks > 0) {
    status = "processing";
  }

  return {
    batch_id: data.batch_id,
    status,
    total_chunks,
    completed_chunks,
    failed_chunks,
    progress_pct:
      total_chunks > 0
        ? Math.round(((completed_chunks + failed_chunks) / total_chunks) * 100)
        : 0,
    total_items: Number(data.total_items || 0),
    matched: Number(data.matched || 0),
    modified: Number(data.modified || 0),
    upserted: Number(data.upserted || 0),
    errors: JSON.parse(data.errors || "[]"),
    created_at: Number(data.created_at || 0),
    updated_at: Number(data.updated_at || 0),
  };
}

export { batchKey, BATCH_TTL_SECONDS };