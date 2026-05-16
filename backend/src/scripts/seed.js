import dotenv from "dotenv";
import mockData from "../data/mockData.json" with { type: "json" };
import { connectDb } from "../config/db.js";
import { Order } from "../models/Order.js";
import { PackingLog } from "../models/PackingLog.js";
import { Product } from "../models/Product.js";

dotenv.config();

await connectDb();

await PackingLog.deleteMany({});
await Order.deleteMany({});
await Product.deleteMany({});

const products = await Product.insertMany(mockData.products);
const barcodeMap = new Map(products.map((product) => [product.barcode, product]));

for (const mockOrder of mockData.orders) {
  await Order.create({
    invoiceNo: mockOrder.invoiceNo,
    customerName: mockOrder.customerName,
    items: mockOrder.items.map((item) => {
      const product = barcodeMap.get(item.barcode);
      return {
        productId: product._id,
        productName: product.productName,
        quantity: item.quantity,
        packedQuantity: 0,
        invoiceLine: `${product.productName} ${item.quantity}`
      };
    })
  });
}

console.log(`Seeded ${products.length} products and ${mockData.orders.length} orders`);
process.exit(0);
