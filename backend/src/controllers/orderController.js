import { Order } from "../models/Order.js";
import { PackingLog } from "../models/PackingLog.js";
import { Product } from "../models/Product.js";
import { parseVyaparInvoice } from "../services/pdfParser.js";
import { hydrateInvoiceItems } from "../services/productMatcher.js";

function populateOrder(query) {
  return query.populate("items.productId", "productName barcode aliases category");
}

function normalizeBarcode(value = "") {
  return value?.toString().trim().replace(/\D/g, "") || "";
}

function normalizeScanText(value = "") {
  return value
    ?.toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[×✕✖]/g, "x")
    .replace(/[^a-z0-9]+/g, "") || "";
}

function getItemScanCandidates(entry) {
  const product = entry?.productId && typeof entry.productId === "object" ? entry.productId : null;
  return [
    entry?.hsnOrBarcode,
    entry?.productName,
    product?.barcode,
    product?.productName,
    ...(product?.aliases || [])
  ].filter(Boolean);
}

function isCompletedStatus(status) {
  return status === "Completed" || status === "Packed";
}

function findOrderItemByScan(order, scannedValue) {
  const scannedBarcode = normalizeBarcode(scannedValue);
  const scannedText = normalizeScanText(scannedValue);
  if (!scannedBarcode && !scannedText) return null;

  const getItemBarcode = (entry) => normalizeBarcode(entry.hsnOrBarcode || entry.productId?.barcode);
  const exactMatch = scannedBarcode ? order.items.find((entry) => getItemBarcode(entry) === scannedBarcode) : null;
  if (exactMatch) return exactMatch;

  const withoutLeadingZeros = scannedBarcode.replace(/^0+/, "");
  const leadingZeroMatch = scannedBarcode ? order.items.find((entry) => {
    const itemBarcode = getItemBarcode(entry).replace(/^0+/, "");
    return itemBarcode && itemBarcode === withoutLeadingZeros;
  }) : null;
  if (leadingZeroMatch) return leadingZeroMatch;

  const textMatches = scannedText ? order.items.filter((entry) => {
    const candidates = getItemScanCandidates(entry).map(normalizeScanText).filter(Boolean);
    return candidates.some((candidate) => candidate === scannedText || candidate.includes(scannedText) || scannedText.includes(candidate));
  }) : [];
  if (textMatches.length === 1) return textMatches[0];

  const nearMatches = scannedBarcode ? order.items.filter((entry) => {
    const itemBarcode = getItemBarcode(entry);
    const lengthDifference = Math.abs(itemBarcode.length - scannedBarcode.length);
    return itemBarcode && lengthDifference <= 1 && (itemBarcode.includes(scannedBarcode) || scannedBarcode.includes(itemBarcode));
  }) : [];

  return nearMatches.length === 1 ? nearMatches[0] : null;
}

function getOrderItemByIndex(order, itemIndex) {
  const index = Number.parseInt(itemIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index >= order.items.length) return null;
  return order.items[index];
}

function hasSuspiciousInvoiceItems(items = []) {
  if (!items.length) return true;

  return items.some((item) => {
    const name = item?.productName?.toString().trim() || "";
    const line = item?.invoiceLine?.toString().trim() || "";
    const hasMoney = Number.isFinite(item?.pricePerUnit) && item.pricePerUnit > 0 && Number.isFinite(item?.totalAmount) && item.totalAmount > 0;
    const hasQuantity = Number.isFinite(item?.quantity) && item.quantity > 0;

    return (
      !name ||
      !hasMoney ||
      !hasQuantity ||
      name.length > 140 ||
      /^\d+(?:\.\d+)?$/.test(name) ||
      /^#?\s*(item|qty|quantity|price|amount|total|hsn|barcode)\b/i.test(name) ||
      (line && line.length > 280)
    );
  });
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

export async function updateOrder(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const { customerName } = req.body;
  if (!customerName?.trim()) {
    return res.status(400).json({ message: "Party name is required" });
  }

  order.customerName = customerName.trim();
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.json({ message: "Party name updated", order: populated });
}

export async function addOrderItem(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const { productName, hsnOrBarcode, barcode, quantity, pricePerUnit } = req.body;
  const nextQuantity = Number(quantity);
  const nextPricePerUnit = Number(pricePerUnit);
  if (!productName?.trim()) {
    return res.status(400).json({ message: "Product name is required" });
  }
  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    return res.status(400).json({ message: "Quantity must be greater than 0" });
  }

  order.items.push({
    serialNo: order.items.reduce((highest, item) => Math.max(highest, item.serialNo || 0), 0) + 1,
    productName: productName.trim(),
    hsnOrBarcode: (hsnOrBarcode || barcode || "").toString().trim(),
    quantity: nextQuantity,
    pricePerUnit: Number.isFinite(nextPricePerUnit) && nextPricePerUnit > 0 ? nextPricePerUnit : 0,
    totalAmount: Number.isFinite(nextPricePerUnit) && nextPricePerUnit > 0 ? Number((nextQuantity * nextPricePerUnit).toFixed(2)) : 0,
    packedQuantity: 0,
    invoiceLine: "Manually added"
  });

  order.recalculateStatus();
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.status(201).json({ message: "Item added", order: populated });
}

export async function updateOrderItem(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemByIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  const { productName, hsnOrBarcode, quantity, pricePerUnit, totalAmount } = req.body;
  const nextQuantity = Number(quantity);
  if (!productName?.trim()) {
    return res.status(400).json({ message: "Product name is required" });
  }
  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    return res.status(400).json({ message: "Quantity must be greater than 0" });
  }

  item.productName = productName.trim();
  item.hsnOrBarcode = hsnOrBarcode?.trim() || "Missing";
  item.quantity = nextQuantity;
  item.pricePerUnit = Number.isFinite(Number(pricePerUnit)) ? Number(pricePerUnit) : 0;
  item.totalAmount = Number.isFinite(Number(totalAmount)) ? Number(totalAmount) : 0;
  item.packedQuantity = Math.min(item.packedQuantity, item.quantity);

  order.recalculateStatus();
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.json({ message: `${item.productName} updated`, order: populated });
}

export async function manuallyPackOrderItem(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemByIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (item.packedQuantity >= item.quantity) {
    return res.status(409).json({ message: `Qty completed: ${item.productName} is already fully packed` });
  }

  const remainingQuantity = item.quantity - item.packedQuantity;
  item.packedQuantity += Math.min(1, remainingQuantity);
  order.recalculateStatus();
  await order.save();

  await PackingLog.create({
    orderId: order._id,
    productId: item.productId,
    scannedAt: new Date(),
    scannedBy: req.body.scannedBy || "packing-staff",
    barcode: "manual-missing-barcode"
  });

  const populated = await populateOrder(Order.findById(order._id));
  const itemCompleted = item.packedQuantity >= item.quantity;
  res.json({
    message: populated.packedStatus === "Completed" ? "Order completed" : itemCompleted ? "Qty completed" : `${item.productName} manually packed`,
    packedItem: { productId: item.productId, hsnOrBarcode: item.hsnOrBarcode, productName: item.productName },
    order: populated
  });
}

export async function manuallyPackFullOrderItem(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemByIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if (item.packedQuantity >= item.quantity) {
    return res.status(409).json({ message: `Qty completed: ${item.productName} is already fully packed` });
  }

  item.packedQuantity = item.quantity;
  order.recalculateStatus();
  await order.save();

  await PackingLog.create({
    orderId: order._id,
    productId: item.productId,
    scannedAt: new Date(),
    scannedBy: req.body.scannedBy || "packing-staff",
    barcode: "manual-full-quantity"
  });

  const populated = await populateOrder(Order.findById(order._id));
  res.json({
    message: populated.packedStatus === "Completed" ? "Order completed" : `${item.productName} full quantity packed`,
    packedItem: { productId: item.productId, hsnOrBarcode: item.hsnOrBarcode, productName: item.productName },
    order: populated
  });
}

export async function manuallyCompleteOrder(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const changedItems = order.items.filter((item) => (item.packedQuantity || 0) < (item.quantity || 0));
  if (!changedItems.length) {
    const populated = await populateOrder(Order.findById(order._id));
    return res.json({ message: "Order already completed", order: populated });
  }

  changedItems.forEach((item) => {
    item.packedQuantity = item.quantity;
  });

  order.recalculateStatus();
  await order.save();

  await PackingLog.insertMany(changedItems.map((item) => ({
    orderId: order._id,
    productId: item.productId,
    scannedAt: new Date(),
    scannedBy: req.body.scannedBy || "packing-staff",
    barcode: normalizeBarcode(item.hsnOrBarcode || item.productId?.barcode) || "manual-order-complete"
  })));

  const populated = await populateOrder(Order.findById(order._id));
  res.json({
    message: "Order manually completed",
    order: populated
  });
}

export async function removePackedOrderItem(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemByIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  item.packedQuantity = 0;
  order.recalculateStatus();
  await order.save();

  await PackingLog.deleteMany({
    orderId: order._id,
    $or: [
      { productId: item.productId },
      { barcode: normalizeBarcode(item.hsnOrBarcode || item.productId?.barcode) },
      { barcode: "manual-missing-barcode" },
      { barcode: "manual-full-quantity" }
    ]
  });

  const populated = await populateOrder(Order.findById(order._id));
  res.json({
    message: `${item.productName} removed from packed`,
    order: populated
  });
}

export async function removeOnePackedOrderItem(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemByIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  if ((item.packedQuantity || 0) <= 0) {
    return res.status(409).json({ message: `${item.productName} has no packed quantity to remove` });
  }

  item.packedQuantity = Math.max(0, (item.packedQuantity || 0) - 1);
  order.recalculateStatus();
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.json({
    message: `1 packed quantity removed from ${item.productName}`,
    order: populated
  });
}

export async function uploadInvoice(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "Invoice PDF is required" });
    }

    const parsed = await parseVyaparInvoice(req.file.buffer);
    if (!parsed?.invoiceNo || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      console.error("Parser error:", new Error("Parsed invoice payload is missing required fields"));
      return res.status(422).json({ success: false, message: "Unsupported invoice format" });
    }

    const existing = await Order.findOne({ invoiceNo: parsed.invoiceNo });
    if (existing) {
      return res.status(409).json({ success: false, message: `Invoice ${parsed.invoiceNo} already exists` });
    }

    const safeItems = parsed.items.filter((item) => {
      const valid = item?.productName && Number.isFinite(item.quantity) && item.quantity > 0;
      if (!valid) {
        console.warn("Failed row:", item);
      }
      return valid;
    });

    if (!safeItems.length) {
      return res.status(422).json({ success: false, message: "Unsupported invoice format" });
    }

    if (hasSuspiciousInvoiceItems(safeItems)) {
      console.warn("Suspicious invoice parse rejected:", safeItems);
      return res.status(422).json({
        success: false,
        message: "Invoice items were not cleanly extracted. Please upload the original Vyapar PDF export, not a photo, scan, or compressed shared copy."
      });
    }

    const items = await hydrateInvoiceItems(safeItems);
    const order = await Order.create({
      invoiceNo: parsed.invoiceNo,
      customerName: parsed.customerName || "Walk-in Customer",
      items
    });

    const populated = await populateOrder(Order.findById(order._id));
    return res.status(201).json(populated);
  } catch (error) {
    console.error("Parser error:", error);
    return res.status(error.statusCode || 422).json({ success: false, message: error.message || "Unsupported invoice format" });
  }
}

export async function scanBarcode(req, res) {
  try {
    const { barcode, scannedBy } = req.body;
    if (!barcode?.toString().trim()) {
      return res.status(400).json({ message: "Barcode is required" });
    }

    const order = await Order.findById(req.params.id).populate("items.productId", "productName barcode aliases category");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (isCompletedStatus(order.packedStatus)) {
      return res.status(409).json({ message: "Order is already completed" });
    }

    const scannedBarcode = normalizeBarcode(barcode);
    const scannedText = normalizeScanText(barcode);
    const product = scannedBarcode ? await Product.findOne({ barcode: barcode.toString().trim() }) : null;
    const item = findOrderItemByScan(order, barcode) || (
      product ? order.items.find((entry) => String(entry.productId?._id || entry.productId) === String(product._id)) : null
    );
    if (!item) {
      return res.status(404).json({ message: `Wrong item: ${barcode} is not in this order` });
    }

    if (item.packedQuantity >= item.quantity) {
      return res.status(409).json({ message: `Qty completed: ${item.productName} is already fully packed` });
    }

    const remainingQuantity = item.quantity - item.packedQuantity;
    item.packedQuantity += Math.min(1, remainingQuantity);
    order.recalculateStatus();
    await order.save();

    await PackingLog.create({
      orderId: order._id,
      productId: item.productId?._id || item.productId || product?._id,
      scannedAt: new Date(),
      scannedBy: scannedBy || "packing-staff",
      barcode: scannedBarcode || scannedText
    });

    const populated = await populateOrder(Order.findById(order._id));
    const itemCompleted = item.packedQuantity >= item.quantity;
    res.json({
      message: populated.packedStatus === "Completed" ? "Order completed" : itemCompleted ? "Qty completed" : "Item scanned",
      packedItem: { productId: item.productId?._id || item.productId || product?._id, hsnOrBarcode: item.hsnOrBarcode, productName: item.productName },
      order: populated
    });
  } catch (error) {
    console.error("Scan failed:", error);
    return res.status(500).json({ message: "Scan failed. Please try again." });
  }
}
