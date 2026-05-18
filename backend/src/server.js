import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { purgeExpiredTrashedOrders } from "./controllers/orderController.js";

dotenv.config();

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

const startServer = async () => {
  try {
    const port = process.env.PORT || 5000;

    console.log("Connecting MongoDB...");
    await connectDb();

    console.log("Creating Express App...");
    const app = createApp();

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    const runTrashCleanup = async () => {
      try {
        const result = await purgeExpiredTrashedOrders();
        if (result.deletedCount) {
          console.log(`Trash cleanup permanently deleted ${result.deletedCount} orders`);
        }
      } catch (error) {
        console.error("Trash cleanup failed:", error);
      }
    };

    runTrashCleanup();
    setInterval(runTrashCleanup, 60 * 60 * 1000);

  } catch (error) {
    console.error("SERVER ERROR:");
    console.error(error);
    process.exit(1);
  }
};

startServer();
