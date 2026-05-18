import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractItems, pdfParserInternals } from "../src/services/pdfParser.js";

const { parseVyaparRow } = pdfParserInternals;

describe("pdf parser", () => {
  it("removes trailing inferred quantity from product name when no barcode is present", () => {
    const item = parseVyaparRow("Premium Sugar 10 50 500");

    assert.equal(item.productName, "Premium Sugar");
    assert.equal(item.quantity, 10);
    assert.equal(item.pricePerUnit, 50);
    assert.equal(item.totalAmount, 500);
  });

  it("keeps product pack-size numbers that are not the trailing invoice quantity", () => {
    const item = parseVyaparRow("Tea Powder 250g 4 120 480");

    assert.equal(item.productName, "Tea Powder 250g");
    assert.equal(item.quantity, 4);
  });

  it("still separates barcode and quantity when both are present", () => {
    const item = parseVyaparRow("Premium Sugar 8901234567890 10 50 500");

    assert.equal(item.productName, "Premium Sugar");
    assert.equal(item.hsnOrBarcode, "8901234567890");
    assert.equal(item.quantity, 10);
  });

  it("extracts merged invoice items without putting quantity into the product name", () => {
    const items = extractItems([
      "# Item Name Qty Rate Amount",
      "1 Premium Sugar 10 50 500",
      "2 Tea Powder 250g 4 120 480",
      "Grand Total 980"
    ]);

    assert.deepEqual(
      items.map((item) => ({ productName: item.productName, quantity: item.quantity })),
      [
        { productName: "Premium Sugar", quantity: 10 },
        { productName: "Tea Powder 250g", quantity: 4 }
      ]
    );
  });
});
