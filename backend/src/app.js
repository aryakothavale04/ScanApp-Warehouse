import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import orderRoutes from "./routes/orderRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  const corsOptions = {
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

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "scanapp-api" });
  });

  app.get("/api/test", (req, res) => {
    res.json({ success: true });
  });

  app.use("/api/orders", orderRoutes);
  app.use("/api/products", productRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
