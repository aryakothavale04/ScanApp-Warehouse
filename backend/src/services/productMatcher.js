import { Product } from "../models/Product.js";

function normalize(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function findProductForInvoiceName(productName, hsnOrBarcode) {
  if (hsnOrBarcode) {
    const product = await Product.findOne({ barcode: hsnOrBarcode.toString().trim() }).lean();
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

  for (const item of items) {
    const product = await findProductForInvoiceName(item.productName, item.hsnOrBarcode);
    hydrated.push({
      productId: product?._id,
      productName: product?.productName || item.productName,
      hsnOrBarcode: item.hsnOrBarcode,
      quantity: item.quantity,
      pricePerUnit: item.pricePerUnit,
      totalAmount: item.totalAmount,
      packedQuantity: 0,
      invoiceLine: item.invoiceLine
    });
  }

  return hydrated;
}
