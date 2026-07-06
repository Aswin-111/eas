# Item Sync Queue — Setup

## 1. Install dependencies
```bash
npm install bullmq ioredis
```

## 2. Environment variables (.env)
```
REDIS_URL=redis://127.0.0.1:6379
ITEM_SYNC_CONCURRENCY=3
```
`REDIS_URL` defaults to `redis://127.0.0.1:6379` if not set.

## 3. Run Redis
Make sure a Redis server is running and reachable at `REDIS_URL`.

## 4. Run the worker as a separate process from the API
```bash
node workers/itemSyncWorker.js
```
In production, run this under pm2 (or similar) so it restarts on crash:
```bash
pm2 start workers/itemSyncWorker.js --name item-sync-worker
```
You can scale throughput by running multiple worker instances (BullMQ handles
concurrent consumers safely) or by raising `ITEM_SYNC_CONCURRENCY`.

## 5. New API behavior

### POST /sync-itemmast (unchanged path/auth, changed response)
Now returns **202 Accepted** immediately instead of blocking on the bulk write:
```json
{
  "message": "Item Master sync queued successfully",
  "batch_id": "b3f1c2b0-...",
  "details": {
    "received": 5000,
    "queued": 4990,
    "invalid": 10,
    "total_chunks": 13
  },
  "status_url": "/sync-status/b3f1c2b0-..."
}
```

### GET /sync-status/:batch_id  (new)
Poll this to track progress:
```json
{
  "batch_id": "b3f1c2b0-...",
  "status": "processing",      // queued | processing | completed | completed_with_errors
  "total_chunks": 13,
  "completed_chunks": 7,
  "failed_chunks": 0,
  "progress_pct": 54,
  "total_items": 4990,
  "matched": 2100,
  "modified": 1900,
  "upserted": 990,
  "errors": []
}
```
Batch status is kept in Redis for 6 hours (`BATCH_TTL_SECONDS` in
`queues/itemSyncQueue.js`) after which it expires.

## Why this solves the Mongo limit issue
Previously, `syncItemMast` chunked to 400 ops per `bulkWrite` **but ran all
chunks synchronously inside a single HTTP request**. A very large payload
(tens of thousands of items) could still:
- time out the HTTP connection,
- hold a single Node event-loop turn too long,
- or in pathological cases approach MongoDB's 16MB BSON / batch limits if
  chunk sizing was ever bypassed.

Now the controller only validates + normalizes + enqueues (fast, cheap), and
a separate worker pool drains the queue chunk-by-chunk, each chunk being an
independent, safely-sized `bulkWrite`. If Mongo hiccups on one chunk, BullMQ
retries just that chunk (exponential backoff, 3 attempts) without affecting
the rest of the batch or blocking the API.

## Pagination changes
- `POST /shopdetails` (`getAllShopDetails`) now accepts `page` and `limit`
  (body or query, default `page=1`, `limit=20`) and returns
  `{ total, page, limit, totalPages, data }`. Previously it returned the
  entire item master for a company with no limit.
- `GET /allcust` (`getAllCust`) already had pagination — untouched, kept as
  the reference pattern.
