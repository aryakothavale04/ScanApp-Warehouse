import { Order } from "../models/Order.js";
import { PackingLog } from "../models/PackingLog.js";
import { Product } from "../models/Product.js";
import { parseVyaparInvoice } from "../services/pdfParser.js";
import { hydrateInvoiceItems } from "../services/productMatcher.js";

function populateOrder(query) {
  return query.populate("items.productId", "productName barcode aliases category");
}

const TRASH_RETENTION_MS = 24 * 60 * 60 * 1000;

function isItemTrashed(item) {
  return Boolean(item?.trashedAt);
}

function getActiveItems(items = []) {
  return items.filter((item) => !isItemTrashed(item));
}

function getDeletedItems(items = []) {
  return items.filter(isItemTrashed);
}

function buildProgress(items = []) {
  return {
    totalQuantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    packedQuantity: items.reduce((sum, item) => sum + (item.packedQuantity || 0), 0)
  };
}

function serializeOrder(order, { includeDeletedItems = false } = {}) {
  const data = typeof order?.toObject === "function" ? order.toObject({ virtuals: true }) : order;
  if (!data) return data;

  const activeItems = getActiveItems(data.items || []);
  const deletedItems = (data.items || []).flatMap((item, originalIndex) => isItemTrashed(item) ? [{
    ...item,
    originalIndex,
    orderId: data._id,
    invoiceNo: data.invoiceNo,
    customerName: data.customerName,
    deletedAt: item.trashedAt
  }] : []);

  return {
    ...data,
    items: includeDeletedItems ? data.items || [] : activeItems,
    deletedItems: includeDeletedItems ? deletedItems : undefined,
    progress: buildProgress(activeItems)
  };
}

function serializeOrders(orders = [], options) {
  return orders.map((order) => serializeOrder(order, options));
}

async function normalizeActiveOrderSequence() {
  const missingOrders = await Order.find({ trashedAt: { $exists: false }, orderSequence: { $exists: false } })
    .select("_id createdAt")
    .sort({ createdAt: -1 });

  if (!missingOrders.length) return;

  let nextSequence = 0;
  const firstSequencedOrder = await Order.findOne({ trashedAt: { $exists: false }, orderSequence: { $exists: true } })
    .select("orderSequence")
    .sort({ orderSequence: 1 })
    .lean();

  if (Number.isFinite(firstSequencedOrder?.orderSequence)) {
    nextSequence = firstSequencedOrder.orderSequence - missingOrders.length;
  }

  await Promise.all(missingOrders.map((order, index) => (
    Order.updateOne({ _id: order._id }, { $set: { orderSequence: nextSequence + index } })
  )));
}

function getDeletedOrderItems(orders = []) {
  return orders.flatMap((order) => {
    const data = serializeOrder(order, { includeDeletedItems: true });
    return (data.deletedItems || []).map((item) => ({
      ...item,
      deleteAfter: new Date(new Date(item.trashedAt).getTime() + TRASH_RETENTION_MS)
    }));
  });
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
  const activeItems = getActiveItems(order.items || []);
  const exactMatch = scannedBarcode ? activeItems.find((entry) => getItemBarcode(entry) === scannedBarcode) : null;
  if (exactMatch) return exactMatch;

  const withoutLeadingZeros = scannedBarcode.replace(/^0+/, "");
  const leadingZeroMatch = scannedBarcode ? activeItems.find((entry) => {
    const itemBarcode = getItemBarcode(entry).replace(/^0+/, "");
    return itemBarcode && itemBarcode === withoutLeadingZeros;
  }) : null;
  if (leadingZeroMatch) return leadingZeroMatch;

  const textMatches = scannedText ? activeItems.filter((entry) => {
    const candidates = getItemScanCandidates(entry).map(normalizeScanText).filter(Boolean);
    return candidates.some((candidate) => candidate === scannedText || candidate.includes(scannedText) || scannedText.includes(candidate));
  }) : [];
  if (textMatches.length === 1) return textMatches[0];

  const nearMatches = scannedBarcode ? activeItems.filter((entry) => {
    const itemBarcode = getItemBarcode(entry);
    const lengthDifference = Math.abs(itemBarcode.length - scannedBarcode.length);
    return itemBarcode && lengthDifference <= 1 && (itemBarcode.includes(scannedBarcode) || scannedBarcode.includes(itemBarcode));
  }) : [];

  return nearMatches.length === 1 ? nearMatches[0] : null;
}

function getOrderItemByIndex(order, itemIndex) {
  const index = Number.parseInt(itemIndex, 10);
  const activeItems = getActiveItems(order.items || []);
  if (!Number.isInteger(index) || index < 0 || index >= activeItems.length) return null;
  return activeItems[index];
}

function getTrashedOrderItemByOriginalIndex(order, itemIndex) {
  const index = Number.parseInt(itemIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index >= order.items.length) return null;
  const item = order.items[index];
  return isItemTrashed(item) ? item : null;
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

export async function purgeExpiredTrashedOrders() {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const expiredOrders = await Order.find({ trashedAt: { $lte: cutoff } }).select("_id").lean();
  const ordersWithExpiredItems = await Order.find({ "items.trashedAt": { $lte: cutoff }, trashedAt: { $exists: false } });
  let deletedItemCount = 0;

  for (const order of ordersWithExpiredItems) {
    const beforeCount = order.items.length;
    order.items = order.items.filter((item) => !item.trashedAt || item.trashedAt > cutoff);
    deletedItemCount += beforeCount - order.items.length;
    order.recalculateStatus();
    await order.save();
  }

  if (!expiredOrders.length) return { deletedCount: 0, deletedItemCount };

  const expiredOrderIds = expiredOrders.map((order) => order._id);
  await PackingLog.deleteMany({ orderId: { $in: expiredOrderIds } });
  const result = await Order.deleteMany({ _id: { $in: expiredOrderIds } });
  return { deletedCount: result.deletedCount || 0, deletedItemCount };
}

export async function listOrders(req, res) {
  await purgeExpiredTrashedOrders();
  await normalizeActiveOrderSequence();
  const orders = await populateOrder(Order.find({ trashedAt: { $exists: false } }).sort({ orderSequence: 1, createdAt: -1 }));
  res.json({ orders: serializeOrders(orders) });
}

export async function updateOrderSequence(req, res) {
  await purgeExpiredTrashedOrders();
  await normalizeActiveOrderSequence();

  const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map((id) => id?.toString()).filter(Boolean) : [];
  if (!orderIds.length) {
    return res.status(400).json({ message: "Order sequence is required" });
  }

  const uniqueOrderIds = [...new Set(orderIds)];
  const activeOrders = await Order.find({ trashedAt: { $exists: false } }).select("_id orderSequence").sort({ orderSequence: 1, createdAt: -1 }).lean();
  const activeIdSet = new Set(activeOrders.map((order) => order._id.toString()));
  const requestedActiveIds = uniqueOrderIds.filter((id) => activeIdSet.has(id));

  if (!requestedActiveIds.length) {
    return res.status(400).json({ message: "No active orders found in sequence" });
  }

  const requestedIdSet = new Set(requestedActiveIds);
  const orderedIds = [
    ...requestedActiveIds,
    ...activeOrders.map((order) => order._id.toString()).filter((id) => !requestedIdSet.has(id))
  ];

  await Promise.all(orderedIds.map((id, index) => (
    Order.updateOne({ _id: id, trashedAt: { $exists: false } }, { $set: { orderSequence: index } })
  )));

  const orders = await populateOrder(Order.find({ trashedAt: { $exists: false } }).sort({ orderSequence: 1, createdAt: -1 }));
  res.json({ orders: serializeOrders(orders), message: "Order sequence updated" });
}

export async function listTrashedOrders(req, res) {
  await purgeExpiredTrashedOrders();
  const orders = await populateOrder(Order.find({ trashedAt: { $exists: true } }).sort({ trashedAt: -1 }));
  const ordersWithDeletedItems = await populateOrder(Order.find({ "items.trashedAt": { $exists: true }, trashedAt: { $exists: false } }).sort({ updatedAt: -1 }));
  res.json({
    orders: serializeOrders(orders, { includeDeletedItems: true }),
    items: getDeletedOrderItems(ordersWithDeletedItems)
  });
}

export async function getOrder(req, res) {
  const order = await populateOrder(Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } }));
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  res.json({ order: serializeOrder(order) });
}

export async function deleteOrder(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  order.trashedAt = new Date();
  await order.save();
  res.json({ success: true, trashedOrderId: order._id, message: "Order moved to trash" });
}

export async function restoreOrder(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: true } });
  if (!order) {
    return res.status(404).json({ message: "Trash order not found" });
  }

  order.trashedAt = undefined;
  await normalizeActiveOrderSequence();
  const firstOrder = await Order.findOne({ trashedAt: { $exists: false } }).select("orderSequence").sort({ orderSequence: 1 }).lean();
  order.orderSequence = Number.isFinite(firstOrder?.orderSequence) ? firstOrder.orderSequence - 1 : 0;
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.json({ message: "Order restored", order: serializeOrder(populated) });
}

export async function permanentlyDeleteOrder(req, res) {
  const order = await Order.findOneAndDelete({ _id: req.params.id, trashedAt: { $exists: true } });
  if (!order) {
    return res.status(404).json({ message: "Trash order not found" });
  }

  await PackingLog.deleteMany({ orderId: order._id });
  res.json({ success: true, deletedOrderId: order._id, message: "Order permanently deleted" });
}

export async function restoreOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getTrashedOrderItemByOriginalIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Trash product not found" });
  }

  item.trashedAt = undefined;
  order.recalculateStatus();
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.json({ message: `${item.productName || "Product"} restored`, order: serializeOrder(populated) });
}

export async function permanentlyDeleteOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const index = Number.parseInt(req.params.itemIndex, 10);
  const item = getTrashedOrderItemByOriginalIndex(order, index);
  if (!item) {
    return res.status(404).json({ message: "Trash product not found" });
  }

  const itemName = item.productName || "Product";
  order.items.splice(index, 1);
  order.recalculateStatus();
  await order.save();

  res.json({ success: true, message: `${itemName} permanently deleted` });
}

export async function emptyTrash(req, res) {
  const trashedOrders = await Order.find({ trashedAt: { $exists: true } }).select("_id").lean();
  const trashedOrderIds = trashedOrders.map((order) => order._id);
  let deletedOrderCount = 0;
  let deletedItemCount = 0;

  if (trashedOrderIds.length) {
    await PackingLog.deleteMany({ orderId: { $in: trashedOrderIds } });
    const result = await Order.deleteMany({ _id: { $in: trashedOrderIds } });
    deletedOrderCount = result.deletedCount || 0;
  }

  const ordersWithDeletedItems = await Order.find({ "items.trashedAt": { $exists: true }, trashedAt: { $exists: false } });
  for (const order of ordersWithDeletedItems) {
    const beforeCount = order.items.length;
    order.items = order.items.filter((item) => !item.trashedAt);
    deletedItemCount += beforeCount - order.items.length;
    order.recalculateStatus();
    await order.save();
  }

  res.json({ success: true, deletedOrderCount, deletedItemCount, message: "Trash emptied" });
}

export async function updateOrder(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
  res.json({ message: "Party name updated", order: serializeOrder(populated) });
}

export async function addOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
  res.status(201).json({ message: "Item added", order: serializeOrder(populated) });
}

export async function updateOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
  res.json({ message: `${item.productName} updated`, order: serializeOrder(populated) });
}

export async function deleteOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const item = getOrderItemByIndex(order, req.params.itemIndex);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }

  item.trashedAt = new Date();
  item.packedQuantity = 0;
  order.recalculateStatus();
  await order.save();

  const populated = await populateOrder(Order.findById(order._id));
  res.json({ message: `${item.productName || "Product"} moved to trash`, order: serializeOrder(populated) });
}

export async function manuallyPackOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
    order: serializeOrder(populated)
  });
}

export async function manuallyPackFullOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
    order: serializeOrder(populated)
  });
}

export async function manuallyCompleteOrder(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const changedItems = getActiveItems(order.items || []).filter((item) => (item.packedQuantity || 0) < (item.quantity || 0));
  if (!changedItems.length) {
    const populated = await populateOrder(Order.findById(order._id));
    return res.json({ message: "Order already completed", order: serializeOrder(populated) });
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
    order: serializeOrder(populated)
  });
}

export async function removePackedOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
    order: serializeOrder(populated)
  });
}

export async function removeOnePackedOrderItem(req, res) {
  const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } });
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
    order: serializeOrder(populated)
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

    const safeItems = parsed.items.map((item, index) => ({
      ...item,
      serialNo: item?.serialNo || index + 1,
      itemName: item?.itemName || item?.productName || "",
      productName: item?.productName || item?.itemName || "",
      hsnOrBarcode: item?.hsnOrBarcode || "",
      itemCode: item?.itemCode || item?.hsnOrBarcode || "",
      quantity: Number.isFinite(item?.quantity) ? item.quantity : 0,
      unitPrice: item?.unitPrice ?? item?.pricePerUnit ?? 0,
      amount: item?.amount ?? item?.totalAmount ?? 0,
      pricePerUnit: item?.pricePerUnit ?? item?.unitPrice ?? 0,
      totalAmount: item?.totalAmount ?? item?.amount ?? 0,
      invoiceLine: item?.invoiceLine || ""
    }));

    if (!safeItems.length) {
      return res.status(422).json({ success: false, message: "Unsupported invoice format" });
    }

    if (hasSuspiciousInvoiceItems(safeItems)) {
      console.warn("Suspicious invoice rows preserved with fallbacks:", safeItems);
    }

    const items = await hydrateInvoiceItems(safeItems);
    await normalizeActiveOrderSequence();
    const firstOrder = await Order.findOne({ trashedAt: { $exists: false } }).select("orderSequence").sort({ orderSequence: 1 }).lean();
    const order = await Order.create({
      invoiceNo: parsed.invoiceNo,
      date: parsed.date,
      customerName: parsed.customerName || "Walk-in Customer",
      contact: parsed.contact,
      subtotal: parsed.subtotal,
      total: parsed.total,
      roundOff: parsed.roundOff,
      balance: parsed.balance,
      previousBalance: parsed.previousBalance,
      currentBalance: parsed.currentBalance,
      paymentType: parsed.paymentType,
      paidAmount: parsed.paidAmount,
      orderSequence: Number.isFinite(firstOrder?.orderSequence) ? firstOrder.orderSequence - 1 : 0,
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

    const order = await Order.findOne({ _id: req.params.id, trashedAt: { $exists: false } }).populate("items.productId", "productName barcode aliases category");
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
      product ? getActiveItems(order.items || []).find((entry) => String(entry.productId?._id || entry.productId) === String(product._id)) : null
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
      order: serializeOrder(populated)
    });
  } catch (error) {
    console.error("Scan failed:", error);
    return res.status(500).json({ message: "Scan failed. Please try again." });
  }
}
