import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true, trim: true, index: true },
    barcode: { type: String, required: true, unique: true, trim: true, index: true },
    aliases: [{ type: String, trim: true }],
    category: { type: String, trim: true, default: "Grocery" }
  },
  { timestamps: true }
);

productSchema.index({ productName: "text", aliases: "text", category: "text" });

export const Product = mongoose.model("Product", productSchema);
