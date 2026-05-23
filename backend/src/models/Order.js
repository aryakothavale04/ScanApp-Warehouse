import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    serialNo: { type: Number, min: 1 },
    itemCode: { type: String, trim: true },
    itemName: { type: String, trim: true },
    nativeName: { type: String, trim: true },
    productName: { type: String, trim: true, default: "" },
    hsnOrBarcode: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0 },
    amount: { type: Number, min: 0 },
    pricePerUnit: { type: Number, min: 0 },
    totalAmount: { type: Number, min: 0 },
    packedQuantity: { type: Number, default: 0, min: 0 },
    invoiceLine: { type: String, trim: true },
    trashedAt: { type: Date, index: true }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true, index: true },
    date: { type: String, trim: true },
    customerName: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    subtotal: { type: Number, min: 0 },
    total: { type: Number, min: 0 },
    roundOff: { type: Number },
    balance: { type: Number, min: 0 },
    previousBalance: { type: Number, min: 0 },
    currentBalance: { type: Number, min: 0 },
    paymentType: { type: String, trim: true },
    paidAmount: { type: Number, min: 0 },
    orderSequence: { type: Number, index: true },
    items: [orderItemSchema],
    packedStatus: {
      type: String,
      enum: ["Pending", "Packed", "Completed"],
      default: "Pending",
      index: true
    },
    trashedAt: { type: Date, index: true }
  },
  { timestamps: true }
);

orderSchema.methods.recalculateStatus = function recalculateStatus() {
  const activeItems = this.items.filter((item) => !item.trashedAt);
  const complete = activeItems.length > 0 && activeItems.every((item) => item.packedQuantity >= item.quantity);
  this.packedStatus = complete ? "Completed" : "Pending";
};

orderSchema.virtual("progress").get(function progress() {
  const activeItems = this.items.filter((item) => !item.trashedAt);
  return {
    totalQuantity: activeItems.reduce((sum, item) => sum + item.quantity, 0),
    packedQuantity: activeItems.reduce((sum, item) => sum + item.packedQuantity, 0)
  };
});

orderSchema.set("toJSON", { virtuals: true });
orderSchema.set("toObject", { virtuals: true });
orderSchema.index({ trashedAt: 1, orderSequence: 1, createdAt: -1 });
orderSchema.index({ "items.trashedAt": 1, trashedAt: 1, updatedAt: -1 });

export const Order = mongoose.model("Order", orderSchema);
