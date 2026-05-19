import { Router } from "express";
import {
  addOrderItem,
  deleteOrder,
  deleteOrderItem,
  emptyTrash,
  getOrder,
  listOrders,
  listTrashedOrders,
  manuallyCompleteOrder,
  manuallyPackFullOrderItem,
  manuallyPackOrderItem,
  permanentlyDeleteOrder,
  removeOnePackedOrderItem,
  removePackedOrderItem,
  restoreOrder,
  scanBarcode,
  updateOrder,
  updateOrderItem,
  uploadInvoice
} from "../controllers/orderController.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { invoiceUpload } from "../middleware/upload.js";

const router = Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const uploadRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: Number.parseInt(process.env.UPLOAD_RATE_LIMIT_PER_HOUR || "40", 10),
  message: "Too many PDF uploads. Please wait and try again."
});

router.get("/", asyncHandler(listOrders));
router.post("/upload", uploadRateLimit, invoiceUpload.single("invoice"), asyncHandler(uploadInvoice));
router.get("/trash", asyncHandler(listTrashedOrders));
router.delete("/trash/empty", asyncHandler(emptyTrash));
router.get("/:id", asyncHandler(getOrder));
router.patch("/:id", asyncHandler(updateOrder));
router.delete("/:id", asyncHandler(deleteOrder));
router.post("/:id/restore", asyncHandler(restoreOrder));
router.delete("/:id/permanent", asyncHandler(permanentlyDeleteOrder));
router.post("/:id/scan", asyncHandler(scanBarcode));
router.post("/:id/manual-complete", asyncHandler(manuallyCompleteOrder));
router.post("/:id/items", asyncHandler(addOrderItem));
router.delete("/:id/items/:itemIndex", asyncHandler(deleteOrderItem));
router.patch("/:id/items/:itemIndex", asyncHandler(updateOrderItem));
router.post("/:id/items/:itemIndex/manual-pack", asyncHandler(manuallyPackOrderItem));
router.post("/:id/items/:itemIndex/manual-pack-full", asyncHandler(manuallyPackFullOrderItem));
router.post("/:id/items/:itemIndex/remove-pack-one", asyncHandler(removeOnePackedOrderItem));
router.post("/:id/items/:itemIndex/remove-pack", asyncHandler(removePackedOrderItem));

export default router;
