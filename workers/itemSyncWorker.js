// workers/itemSyncWorker.js
//
// Run this as its own process, separate from the Express app:
//   node workers/itemSyncWorker.js
// or under pm2:
//   pm2 start workers/itemSyncWorker.js --name item-sync-worker
//
import { Worker } from "bullmq";
import mongoose from "mongoose";
import dotenv from "dotenv";

import connection from "../config/redis.js";
import connectDB from "../config/db.js";
import ItemMast from "../models/ItemMast.js";
import { ITEM_SYNC_QUEUE, batchKey } from "../queues/itemSyncQueue.js";

dotenv.config();

// This worker needs its own Mongo connection since it runs as a separate process.
await connectDB();

const CONCURRENCY = Number(process.env.ITEM_SYNC_CONCURRENCY || 3);

const worker = new Worker(
  ITEM_SYNC_QUEUE,
  async (job) => {
    const { batch_id, chunk_index, items } = job.data;
    const key = batchKey(batch_id);

    if (!Array.isArray(items) || items.length === 0) {
      await connection.hincrby(key, "completed_chunks", 1);
      await connection.hset(key, "updated_at", Date.now());
      return { chunk_index, skipped: true };
    }

    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { comp_code: item.comp_code, item_code: item.item_code },
        update: { $set: item },
        upsert: true,
      },
    }));

    try {
      const result = await ItemMast.bulkWrite(bulkOps, { ordered: false });

      const matched = result.matchedCount ?? 0;
      const modified = result.modifiedCount ?? 0;
      const upserted = result.upsertedCount ?? 0;

      const multi = connection.multi();
      multi.hincrby(key, "matched", matched);
      multi.hincrby(key, "modified", modified);
      multi.hincrby(key, "upserted", upserted);
      multi.hincrby(key, "completed_chunks", 1);
      multi.hset(key, "status", "processing");
      multi.hset(key, "updated_at", Date.now());
      await multi.exec();

      return { chunk_index, matched, modified, upserted };
    } catch (err) {
      console.error(
        `item-sync chunk ${chunk_index} (batch ${batch_id}) failed:`,
        err.message
      );

      // Record the failure against the batch, but don't blow up other chunks.
      const errorsRaw = await connection.hget(key, "errors");
      const errors = JSON.parse(errorsRaw || "[]");
      errors.push({
        chunk_index,
        message: err.message,
        item_count: items.length,
        at: Date.now(),
      });

      const multi = connection.multi();
      multi.hincrby(key, "failed_chunks", 1);
      multi.hset(key, "errors", JSON.stringify(errors));
      multi.hset(key, "updated_at", Date.now());
      await multi.exec();

      // Re-throw so BullMQ applies its retry/backoff policy for this chunk.
      throw err;
    }
  },
  {
    connection,
    concurrency: CONCURRENCY,
  }
);

worker.on("completed", (job) => {
  console.log(`Chunk job ${job.id} completed (batch ${job.data.batch_id})`);
});

worker.on("failed", (job, err) => {
  console.error(
    `Chunk job ${job?.id} failed permanently (batch ${job?.data?.batch_id}):`,
    err.message
  );
});

process.on("SIGTERM", async () => {
  console.log("item-sync worker shutting down...");
  await worker.close();
  await mongoose.disconnect();
  process.exit(0);
});

console.log(`item-sync worker started with concurrency ${CONCURRENCY}`);