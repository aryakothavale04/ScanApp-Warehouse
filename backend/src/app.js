import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import orderRoutes from "./routes/orderRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import { requireAccessCode } from "./middleware/accessCodeAuth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { createRateLimiter } from "./middleware/rateLimit.js";

const DEFAULT_FRONTEND_ORIGIN = "https://scan-app-warehouse.vercel.app";

export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || DEFAULT_FRONTEND_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  const corsOptions = {
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-access-code"],
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  };
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  const apiRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: Number.parseInt(process.env.API_RATE_LIMIT_PER_MINUTE || "300", 10)
  });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "scanapp-api" });
  });

  app.get("/api/test", (req, res) => {
    res.json({ success: true });
  });

  app.use("/api/orders", requireAccessCode, apiRateLimit, orderRoutes);
  app.use("/api/products", requireAccessCode, apiRateLimit, productRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
