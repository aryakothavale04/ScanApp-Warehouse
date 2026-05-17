export function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, req, res, next) {
  if (error.code === "LIMIT_FILE_SIZE") {
    const maxInvoiceSizeMb = process.env.MAX_INVOICE_SIZE_MB || "50";
    return res.status(413).json({
      message: `Invoice PDF is too large. Please upload a PDF up to ${maxInvoiceSizeMb} MB.`
    });
  }

  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || "Server error",
    ...(process.env.NODE_ENV !== "production" ? { stack: error.stack } : {})
  });
}
