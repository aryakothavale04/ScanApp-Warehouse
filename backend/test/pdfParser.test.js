import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractItems, pdfParserInternals } from "../src/services/pdfParser.js";

const { isolateMultilingualName, parseVyaparRow } = pdfParserInternals;

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

  it("isolates native-script names and item codes from English product names", () => {
    const item = parseVyaparRow("SA जाम पाट 5 Jam Party4 5 20");

    assert.equal(item.itemCode, "SA");
    assert.equal(item.hsnOrBarcode, "SA");
    assert.equal(item.nativeName, "जाम पाट 5");
    assert.equal(item.productName, "Jam Party");
    assert.equal(item.quantity, 4);
    assert.equal(item.pricePerUnit, 5);
    assert.equal(item.totalAmount, 20);
  });

  it("keeps pack-size digits while removing attached invoice quantity", () => {
    const item = parseVyaparRow("मायलो 10 Milo 103 10 30");

    assert.equal(item.nativeName, "मायलो 10");
    assert.equal(item.productName, "Milo 10");
    assert.equal(item.quantity, 3);
  });

  it("keeps repeated short brand text when the first token is also the item code", () => {
    const item = parseVyaparRow("Rk ब्लेड Rk Blade1 5 5");

    assert.equal(item.itemCode, "Rk");
    assert.equal(item.productName, "Rk Blade");
    assert.equal(item.quantity, 1);
  });

  it("parses tab-separated positional columns without merging the amount fields into the name", () => {
    const item = parseVyaparRow("SA जाम पाट 5 Jam Party4\t4\t5\t20");

    assert.equal(item.itemCode, "SA");
    assert.equal(item.productName, "Jam Party");
    assert.equal(item.quantity, 4);
    assert.equal(item.unitPrice, 5);
    assert.equal(item.amount, 20);
  });

  it("normalizes compact merged headers", () => {
    assert.equal(isolateMultilingualName("SA जाम पाट 5 Jam Party4", 4).productName, "Jam Party");
  });
  it("extracts serial/native/detail rows from machine-readable Vyapar text", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "1",
      "SA \u091c\u093e\u092e Rs 5",
      "Jam Party4 Rs 52 Rs 208",
      "2",
      "Rk \u092c\u094d\u0932\u0947\u0921",
      "Rk Blade1 Rs 42 Rs 42",
      "Total32 Rs 250"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { productName: "Jam Party", quantity: 4, pricePerUnit: 52, totalAmount: 208 },
        { productName: "Rk Blade", quantity: 1, pricePerUnit: 42, totalAmount: 42 }
      ]
    );
  });

  it("keeps multi-line item details and glued serial rows in order", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "16",
      "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u091a\u0949\u0915\u094b\u0932\u0947\u091f 5/-",
      "Sobisco Cream Chocolate",
      "31.8g",
      "1 Rs 52 Rs 52",
      "17",
      "\u0932\u094b\u0915\u0932 cake Rs 5x12pic",
      "89023517777801 Rs 52 Rs 52",
      "18Fair And Lovely1 Rs 115 Rs 115",
      "1913x161 Rs 70 Rs 70",
      "Total4 Rs 289"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        hsnOrBarcode: item.hsnOrBarcode,
        quantity: item.quantity,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 16, productName: "Sobisco Cream Chocolate 31.8g", hsnOrBarcode: "", quantity: 1, totalAmount: 52 },
        { serialNo: 17, productName: "cake 5x12pic", hsnOrBarcode: "8902351777780", quantity: 1, totalAmount: 52 },
        { serialNo: 18, productName: "Fair And Lovely", hsnOrBarcode: "", quantity: 1, totalAmount: 115 },
        { serialNo: 19, productName: "13x16", hsnOrBarcode: "", quantity: 1, totalAmount: 70 }
      ]
    );
  });
});
