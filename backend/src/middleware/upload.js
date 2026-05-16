import multer from "multer";

const storage = multer.memoryStorage();

export const invoiceUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF invoices are allowed"));
      return;
    }
    cb(null, true);
  }
});
