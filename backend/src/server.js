import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";

dotenv.config();

const port = process.env.PORT || 5000;

await connectDb();

createApp().listen(port, () => {
  console.log(`ScanApp API running on http://localhost:${port}`);
});
