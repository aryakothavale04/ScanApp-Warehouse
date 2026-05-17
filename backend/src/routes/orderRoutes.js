import { Router } from "express";
import {
  addOrderItem,
  deleteOrder,
  getOrder,
  listOrders,
  manuallyPackOrderItem,
  removePackedOrderItem,
  scanBarcode,
  updateOrder,
  updateOrderItem,
  uploadInvoice
} from "../controllers/orderController.js";
import { invoiceUpload } from "../middleware/upload.js";

const router = Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.get("/", asyncHandler(listOrders));
router.post("/upload", invoiceUpload.single("invoice"), asyncHandler(uploadInvoice));
router.get("/:id", asyncHandler(getOrder));
router.patch("/:id", asyncHandler(updateOrder));
router.delete("/:id", asyncHandler(deleteOrder));
router.post("/:id/scan", asyncHandler(scanBarcode));
router.post("/:id/items", asyncHandler(addOrderItem));
router.patch("/:id/items/:itemIndex", asyncHandler(updateOrderItem));
router.post("/:id/items/:itemIndex/manual-pack", asyncHandler(manuallyPackOrderItem));
router.post("/:id/items/:itemIndex/remove-pack", asyncHandler(removePackedOrderItem));

export default router;
