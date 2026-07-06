// config/redis.js
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

connection.on("connect", () => {
  console.log("Redis connected");
});

connection.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

export default connection;