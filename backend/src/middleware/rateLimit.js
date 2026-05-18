import mongoose from "mongoose";

function getClientKey(req) {
  return req.ip || req.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const memoryHits = new Map();
let indexReady = null;

function getBucketId(key, windowMs) {
  return `${key}:${windowMs}:${Math.floor(Date.now() / windowMs)}`;
}

function createMemoryRateLimiter({ windowMs, maxRequests, message }) {
  return function memoryRateLimiter(req, res, next) {
    const now = Date.now();
    const key = getClientKey(req);
    const current = memoryHits.get(key);

    if (!current || current.resetAt <= now) {
      memoryHits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.set("Retry-After", retryAfterSeconds.toString());
      res.status(429).json({
        success: false,
        message: message || "Too many requests. Please wait and try again."
      });
      return;
    }

    next();
  };
}

async function ensureRateLimitIndexes(collection) {
  indexReady ||= collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await indexReady;
}

export function createRateLimiter({ windowMs, maxRequests, message }) {
  const fallbackLimiter = createMemoryRateLimiter({ windowMs, maxRequests, message });

  return async function rateLimiter(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
      fallbackLimiter(req, res, next);
      return;
    }

    try {
      const now = new Date();
      const resetAt = new Date(now.getTime() + windowMs);
      const collection = mongoose.connection.collection("rate_limits");
      await ensureRateLimitIndexes(collection);

      const result = await collection.findOneAndUpdate(
        { _id: getBucketId(getClientKey(req), windowMs) },
        {
          $inc: { count: 1 },
          $setOnInsert: { resetAt, expiresAt: resetAt }
        },
        {
          upsert: true,
          returnDocument: "after"
        }
      );

      const current = result.value || result;
      if ((current?.count || 0) > maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((new Date(current.resetAt).getTime() - Date.now()) / 1000));
        res.set("Retry-After", retryAfterSeconds.toString());
        res.status(429).json({
          success: false,
          message: message || "Too many requests. Please wait and try again."
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
