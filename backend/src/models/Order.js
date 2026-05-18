import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    serialNo: { type: Number, min: 1 },
    productName: { type: String, required: true, trim: true },
    hsnOrBarcode: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0.001 },
    pricePerUnit: { type: Number, min: 0 },
    totalAmount: { type: Number, min: 0 },
    packedQuantity: { type: Number, default: 0, min: 0 },
    invoiceLine: { type: String, trim: true }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true, index: true },
    customerName: { type: String, required: true, trim: true },
    items: [orderItemSchema],
    packedStatus: {
      type: String,
      enum: ["Pending", "Packed", "Completed"],
      default: "Pending",
      index: true
    }
  },
  { timestamps: true }
);

orderSchema.methods.recalculateStatus = function recalculateStatus() {
  const complete = this.items.length > 0 && this.items.every((item) => item.packedQuantity >= item.quantity);
  this.packedStatus = complete ? "Completed" : "Pending";
};

orderSchema.virtual("progress").get(function progress() {
  return {
    totalQuantity: this.items.reduce((sum, item) => sum + item.quantity, 0),
    packedQuantity: this.items.reduce((sum, item) => sum + item.packedQuantity, 0)
  };
});

orderSchema.set("toJSON", { virtuals: true });
orderSchema.set("toObject", { virtuals: true });

export const Order = mongoose.model("Order", orderSchema);
