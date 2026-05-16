import { Product } from "../models/Product.js";

export async function listProducts(req, res) {
  const filter = req.query.q
    ? { $text: { $search: req.query.q } }
    : {};
  const products = await Product.find(filter).sort({ productName: 1 }).limit(100);
  res.json({ products });
}

export async function createProduct(req, res) {
  const { productName, barcode, aliases = [], category = "Grocery" } = req.body;
  if (!productName || !barcode) {
    return res.status(400).json({ message: "productName and barcode are required" });
  }

  const product = await Product.create({ productName, barcode, aliases, category });
  res.status(201).json({ product });
}
