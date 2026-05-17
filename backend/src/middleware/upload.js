import multer from "multer";

const storage = multer.memoryStorage();
const DEFAULT_MAX_INVOICE_SIZE_MB = 50;
const maxInvoiceSizeMb = Number.parseInt(process.env.MAX_INVOICE_SIZE_MB || `${DEFAULT_MAX_INVOICE_SIZE_MB}`, 10);

export const invoiceUpload = multer({
  storage,
  limits: { fileSize: maxInvoiceSizeMb * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF invoices are allowed"));
      return;
    }
    cb(null, true);
  }
});
