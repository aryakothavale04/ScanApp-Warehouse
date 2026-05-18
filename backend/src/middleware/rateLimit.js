function getClientKey(req) {
  return req.ip || req.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function createRateLimiter({ windowMs, maxRequests, message }) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = getClientKey(req);
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
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
