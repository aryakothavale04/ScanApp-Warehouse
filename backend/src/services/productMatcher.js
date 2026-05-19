import { Product } from "../models/Product.js";

function normalize(value = "") {
  return value
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[×✕✖]/g, "x")
    .replace(/[^a-z0-9]+/g, "");
}

export async function findProductForInvoiceName(productName, hsnOrBarcode) {
  const barcode = hsnOrBarcode?.toString().trim();
  if (barcode) {
    const product = await Product.findOne({ barcode }).lean();
    if (product) return product;
  }

  const normalizedName = normalize(productName);
  if (!normalizedName) return null;

  const products = await Product.find({}).lean();
  return products.find((product) => {
    const names = [product.productName, ...(product.aliases || [])].map(normalize);
    return names.some((name) => name === normalizedName || normalizedName.includes(name) || name.includes(normalizedName));
  }) || null;
}

export async function hydrateInvoiceItems(items) {
  const hydrated = [];

  for (const item of items || []) {
    if (!item?.productName || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      console.warn("Failed row:", item);
      continue;
    }

    const product = await findProductForInvoiceName(item.productName, item.hsnOrBarcode);
    hydrated.push({
      productId: product?._id,
      serialNo: item.serialNo,
      itemCode: item.itemCode || item.hsnOrBarcode || "",
      itemName: product?.productName || item.itemName || item.productName,
      nativeName: item.nativeName || "",
      productName: product?.productName || item.productName,
      hsnOrBarcode: item.hsnOrBarcode || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? item.pricePerUnit,
      amount: item.amount ?? item.totalAmount,
      pricePerUnit: item.pricePerUnit,
      totalAmount: item.totalAmount,
      packedQuantity: 0,
      invoiceLine: item.invoiceLine
    });
  }

  return hydrated;
}
