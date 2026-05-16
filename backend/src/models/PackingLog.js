import mongoose from "mongoose";

const packingLogSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },
    scannedAt: { type: Date, default: Date.now },
    scannedBy: { type: String, default: "packing-staff", trim: true },
    barcode: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export const PackingLog = mongoose.model("PackingLog", packingLogSchema);
