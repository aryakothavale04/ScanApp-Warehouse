import { Order } from "../models/Order.js";
import { PackingLog } from "../models/PackingLog.js";
import { Product } from "../models/Product.js";
import { parseVyaparInvoice } from "../services/pdfParser.js";
import { hydrateInvoiceItems } from "../services/productMatcher.js";

function populateOrder(query) {
  return query.populate("items.productId", "productName barcode aliases category");
}

export async function listOrders(req, res) {
  const orders = await populateOrder(Order.find({}).sort({ createdAt: -1 }));
  res.json({ orders });
}

export async function getOrder(req, res) {
  const order = await populateOrder(Order.findById(req.params.id));
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  res.json({ order });
}

export async function deleteOrder(req, res) {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  await PackingLog.deleteMany({ orderId: order._id });
  res.json({ success: true, deletedOrderId: order._id });
}

export async function uploadInvoice(req, res) {
  if (!req.file?.buffer) {
    return res.status(400).json({ message: "Invoice PDF is required" });
  }

  const parsed = await parseVyaparInvoice(req.file.buffer);
  const existing = await Order.findOne({ invoiceNo: parsed.invoiceNo });
  if (existing) {
    return res.status(409).json({ message: `Invoice ${parsed.invoiceNo} already exists` });
  }

  const items = await hydrateInvoiceItems(parsed.items);
  const order = await Order.create({
    invoiceNo: parsed.invoiceNo,
    customerName: parsed.customerName,
    items
  });

  const populated = await populateOrder(Order.findById(order._id));
  res.status(201).json(populated);
}

export async function scanBarcode(req, res) {
  const { barcode, scannedBy } = req.body;
  if (!barcode) {
    return res.status(400).json({ message: "Barcode is required" });
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  if (order.packedStatus === "Packed") {
    return res.status(409).json({ message: "Order is already packed" });
  }

  const product = await Product.findOne({ barcode: barcode.trim() });
  if (!product) {
    return res.status(404).json({ message: `Barcode ${barcode} is not in product database` });
  }

  const item = order.items.find((entry) => String(entry.productId) === String(product._id));
  if (!item) {
    return res.status(404).json({ message: `${product.productName} is not in this order` });
  }

  if (item.packedQuantity >= item.quantity) {
    return res.status(409).json({ message: `${product.productName} already fully packed` });
  }

  const remainingQuantity = item.quantity - item.packedQuantity;
  item.packedQuantity += Math.min(1, remainingQuantity);
  order.recalculateStatus();
  await order.save();

  await PackingLog.create({
    orderId: order._id,
    productId: product._id,
    scannedAt: new Date(),
    scannedBy,
    barcode: barcode.trim()
  });

  const populated = await populateOrder(Order.findById(order._id));
  res.json({
    message: populated.packedStatus === "Packed" ? "Order completed. सर्व माल पॅक झाला." : `${product.productName} packed`,
    packedItem: { productId: product._id, productName: product.productName },
    order: populated
  });
}
