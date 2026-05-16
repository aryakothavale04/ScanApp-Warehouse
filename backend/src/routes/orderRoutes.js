import { Router } from "express";
import {
  deleteOrder,
  getOrder,
  listOrders,
  manuallyPackOrderItem,
  scanBarcode,
  updateOrderItem,
  uploadInvoice
} from "../controllers/orderController.js";
import { invoiceUpload } from "../middleware/upload.js";

const router = Router();

router.get("/", listOrders);
router.post("/upload", invoiceUpload.single("invoice"), uploadInvoice);
router.get("/:id", getOrder);
router.delete("/:id", deleteOrder);
router.post("/:id/scan", scanBarcode);
router.patch("/:id/items/:itemIndex", updateOrderItem);
router.post("/:id/items/:itemIndex/manual-pack", manuallyPackOrderItem);

export default router;
