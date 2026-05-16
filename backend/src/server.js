import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";

dotenv.config();

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

  } catch (error) {
    console.error("SERVER ERROR:");
    console.error(error);
    process.exit(1);
  }
};

startServer();