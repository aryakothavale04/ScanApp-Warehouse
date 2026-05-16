import { Router } from "express";
import { deleteOrder, getOrder, listOrders, scanBarcode, uploadInvoice } from "../controllers/orderController.js";
import { invoiceUpload } from "../middleware/upload.js";

const router = Router();

router.get("/", listOrders);
router.post("/upload", invoiceUpload.single("invoice"), uploadInvoice);
router.get("/:id", getOrder);
router.delete("/:id", deleteOrder);
router.post("/:id/scan", scanBarcode);

export default router;
