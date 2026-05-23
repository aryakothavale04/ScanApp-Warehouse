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

function findProductInSnapshot(products, productName, hsnOrBarcode) {
  const barcode = hsnOrBarcode?.toString().trim();
  if (barcode) {
    const product = products.byBarcode.get(barcode);
    if (product) return product;
  }

  const normalizedName = normalize(productName);
  if (!normalizedName) return null;

  return products.all.find((product) => {
    const names = [product.productName, ...(product.aliases || [])].map(normalize);
    return names.some((name) => name === normalizedName || normalizedName.includes(name) || name.includes(normalizedName));
  }) || null;
}

export async function hydrateInvoiceItems(items) {
  const hydrated = [];
  const allProducts = await Product.find({}).select("_id productName barcode aliases category").lean();
  const productSnapshot = {
    all: allProducts,
    byBarcode: new Map(allProducts.map((product) => [product.barcode, product]))
  };

  for (const item of items || []) {
    const itemName = item?.itemName || item?.productName || "";
    const quantity = Number.isFinite(item?.quantity) ? item.quantity : 0;
    let product = null;

    try {
      product = findProductInSnapshot(productSnapshot, itemName, item?.hsnOrBarcode);
    } catch (error) {
      console.warn("Product match failed; preserving invoice row:", {
        serialNo: item?.serialNo,
        itemName,
        message: error?.message
      });
    }

    hydrated.push({
      productId: product?._id,
      serialNo: item?.serialNo,
      itemCode: item?.itemCode || item?.hsnOrBarcode || "",
      itemName,
      nativeName: item?.nativeName || "",
      productName: itemName,
      hsnOrBarcode: item?.hsnOrBarcode || "",
      quantity,
      unitPrice: item?.unitPrice ?? item?.pricePerUnit ?? 0,
      amount: item?.amount ?? item?.totalAmount ?? 0,
      pricePerUnit: item?.pricePerUnit ?? item?.unitPrice ?? 0,
      totalAmount: item?.totalAmount ?? item?.amount ?? 0,
      packedQuantity: 0,
      invoiceLine: item?.invoiceLine || ""
    });
  }

  return hydrated;
}
