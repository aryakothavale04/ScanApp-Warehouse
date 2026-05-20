import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractItems, pdfParserInternals } from "../src/services/pdfParser.js";

const {
  buildParserDiagnostics,
  calculateInvoiceTotals,
  isolateMultilingualName,
  normalizeTableHeaderLine,
  parseVyaparRow
} = pdfParserInternals;

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
    assert.equal(item.productName, "Milo ₹10");
    assert.equal(item.quantity, 3);
  });

  it("keeps repeated short brand text when the first token is also the item code", () => {
    const item = parseVyaparRow("Rk ब्लेड Rk Blade1 5 5");

    assert.equal(item.itemCode, "Rk");
    assert.equal(item.productName, "Rk Blade");
    assert.equal(item.quantity, 1);
  });

  it("does not treat pack price markers as item codes", () => {
    const fiveRupeeItem = parseVyaparRow("Rs 5 लेस Lays Classic Salted2 Rs 52 Rs 104");
    const mergedPackItem = parseVyaparRow("Rs 5 लेस Lays Spanish Tomato Rs 52 Rs 52 Rs 104");
    const slashPriceItem = parseVyaparRow("2/- शेव सामोसा Shev Samosa1 Rs 52 Rs 52");

    assert.equal(fiveRupeeItem.productName, "Lays Classic Salted ₹5");
    assert.equal(mergedPackItem.productName, "Lays Spanish Tomato ₹5");
    assert.equal(fiveRupeeItem.itemCode, "");
    assert.equal(fiveRupeeItem.hsnOrBarcode, "");
    assert.equal(slashPriceItem.itemCode, "");
    assert.equal(slashPriceItem.hsnOrBarcode, "");
  });

  it("splits merged pack price and rounded quantity values", () => {
    const highValuePack = parseVyaparRow("Rs 20 लेस Lays American Onion Rs 2030 Rs 16.3 Rs 489");
    const roundedAmountPack = parseVyaparRow("Rs 5 लेस Lays American Onion240 Rs 3.92 Rs 940");
    const mergedPackQuantity = parseVyaparRow("Rs 10 लेस Lays Magic Masala Rs 10144 Rs 8.17 Rs 1,176");

    assert.equal(highValuePack.productName, "Lays American Onion ₹20");
    assert.equal(highValuePack.quantity, 30);
    assert.equal(roundedAmountPack.productName, "Lays American Onion ₹5");
    assert.equal(roundedAmountPack.quantity, 240);
    assert.equal(mergedPackQuantity.productName, "Lays Magic Masala ₹10");
    assert.equal(mergedPackQuantity.quantity, 144);
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

  it("separates compact Vyapar table headers into canonical columns", () => {
    assert.deepEqual(
      normalizeTableHeaderLine("#Item nameItem codeQuantityPrice/ unitAmount").split("\t"),
      ["#", "Item name", "Item code", "Quantity", "Price/unit", "Amount"]
    );
  });

  it("compares final totals after applying round-off", () => {
    const totals = calculateInvoiceTotals(
      [{ totalAmount: 29138.4 }],
      { subtotal: 29138.4, roundOff: -0.4, total: 29138 }
    );

    assert.equal(totals.itemsTotal, 29138.4);
    assert.equal(totals.totalBeforeRoundOff, 29138.4);
    assert.equal(totals.totalAfterRoundOff, 29138);
    assert.equal(totals.totalMatchesAfterRoundOff, true);
  });

  it("reports parser diagnostics for row safety checks", () => {
    const diagnostics = buildParserDiagnostics([
      { serialNo: 1, itemName: "A", quantity: 1, pricePerUnit: 10, totalAmount: 10 },
      { serialNo: 3, itemName: "", quantity: 0, pricePerUnit: 0, totalAmount: 0 },
      { serialNo: 3, itemName: "C", quantity: 1, pricePerUnit: 20, totalAmount: 20 }
    ]);

    assert.deepEqual(diagnostics.missingSerials, [2]);
    assert.deepEqual(diagnostics.duplicateSerials, [3]);
    assert.deepEqual(diagnostics.fallbackRows, [3]);
    assert.equal(diagnostics.rowOrderPreserved, true);
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
        { productName: "SA जाम ₹5", quantity: 4, pricePerUnit: 52, totalAmount: 208 },
        { productName: "Rk ब्लेड", quantity: 1, pricePerUnit: 42, totalAmount: 42 }
      ]
    );
  });

  it("preserves serial rows even when row values are missing", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "1",
      "2",
      "\u0932\u0947\u0938",
      "Lays Onion1 Rs 10 Rs 10",
      "Total1 Rs 10"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        hsnOrBarcode: item.hsnOrBarcode,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 1, productName: "", hsnOrBarcode: "", quantity: 0, pricePerUnit: 0, totalAmount: 0 },
        { serialNo: 2, productName: "लेस", hsnOrBarcode: "", quantity: 1, pricePerUnit: 10, totalAmount: 10 }
      ]
    );
  });

  it("keeps duplicate products as separate serial-numbered rows", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "1",
      "\u0932\u0947\u0938",
      "Lays Onion1 Rs 10 Rs 10",
      "2",
      "\u0932\u0947\u0938",
      "Lays Onion1 Rs 10 Rs 10",
      "3",
      "\u0932\u0947\u0938",
      "Lays Onion1 Rs 10 Rs 10",
      "Total3 Rs 30"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 1, productName: "लेस", quantity: 1, totalAmount: 10 },
        { serialNo: 2, productName: "लेस", quantity: 1, totalAmount: 10 },
        { serialNo: 3, productName: "लेस", quantity: 1, totalAmount: 10 }
      ]
    );
  });

  it("extracts a compact first row before the expected serial is initialized", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "1Sobisco Choco Fill 30/-890235111112630 Rs 25 Rs 750",
      "2",
      "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u092e\u093f\u0932\u094d\u0915 5/-",
      "89023519988716 Rs 52 Rs 312",
      "Total36 Rs 1062"
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
        { serialNo: 1, productName: "Sobisco Choco Fill 30/-", hsnOrBarcode: "8902351111126", quantity: 30, totalAmount: 750 },
        { serialNo: 2, productName: "सोबीस्को मिल्क 5/-", hsnOrBarcode: "8902351998871", quantity: 6, totalAmount: 312 }
      ]
    );
  });

  it("extracts a compact first row when the item name starts with a currency marker", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "1 Rs 60 Matka Kulfi 100ml10 Rs 408 Rs 4080",
      "2",
      "Vanilla Bulk",
      "Vanilla Bulk5 Rs 470 Rs 2350",
      "Total15 Rs 6430"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 1, productName: "₹60 Matka Kulfi 100ml", quantity: 10, pricePerUnit: 408, totalAmount: 4080 },
        { serialNo: 2, productName: "Vanilla Bulk", quantity: 5, pricePerUnit: 470, totalAmount: 2350 }
      ]
    );
  });

  it("does not split an item name that starts with the next serial digit", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "6",
      "750ml थम्स अप Rs 35",
      "Thums Up 600 ml0.5 Rs 780 Rs 390",
      "7",
      "750ml स्प्राईट Rs 35",
      "Sprite 600ml0.5 Rs 780 Rs 390",
      "Total1 Rs 780"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 6, productName: "750ml थम्स अप ₹35", quantity: 0.5, totalAmount: 390 },
        { serialNo: 7, productName: "750ml स्प्राईट ₹35", quantity: 0.5, totalAmount: 390 }
      ]
    );
  });

  it("extracts expected serial rows glued to currency-led item names", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "12",
      "Rs 5 Lays Hot and Sweet240 Rs 3.92 Rs 940",
      "13 Rs 5 Lays Mini Stix24 Rs 47 Rs 1128",
      "14",
      "Rs 5 Kurkure Masala Munch24 Rs 47 Rs 1128",
      "Total288 Rs 3196"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 12, productName: "₹5 Lays Hot and Sweet", quantity: 240, pricePerUnit: 3.92, totalAmount: 940 },
        { serialNo: 13, productName: "₹5 Lays Mini Stix", quantity: 24, pricePerUnit: 47, totalAmount: 1128 },
        { serialNo: 14, productName: "₹5 Kurkure Masala Munch", quantity: 24, pricePerUnit: 47, totalAmount: 1128 }
      ]
    );
  });

  it("keeps barcode detail with the current serial when barcode starts with the next serial", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "7",
      "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u0915\u0947\u0915 \u092b\u094d\u0930\u0941\u091f \u092e\u0941\u092b\u093f\u0928 Rs 5x12pic",
      "89023513331842 Rs 52 Rs 104",
      "8",
      "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u0915\u0947\u0915 \u092e\u0901\u0917\u094b \u092e\u0901\u0917\u094b Rs 5x12pic",
      "89023517777733 Rs 52 Rs 156",
      "Total5 Rs 260"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        hsnOrBarcode: item.hsnOrBarcode,
        quantity: item.quantity,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 7, hsnOrBarcode: "8902351333184", quantity: 2, totalAmount: 104 },
        { serialNo: 8, hsnOrBarcode: "8902351777773", quantity: 3, totalAmount: 156 }
      ]
    );
  });

  it("splits compact pack price, barcode, and quantity from one detail line", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "3",
      "Sobisco Milky Toast 130g Rs 20890235122230312 Rs 18 Rs 216",
      "Total12 Rs 216"
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
        { serialNo: 3, productName: "Sobisco Milky Toast 130g ₹20", hsnOrBarcode: "8902351222303", quantity: 12, totalAmount: 216 }
      ]
    );
  });

  it("preserves decimal quantities from the quantity column", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "5",
      "750ml \u0925\u092e\u094d\u0938 \u0905\u092a Rs 35",
      "Thums Up 600 ml0.5 Rs 780 Rs 390",
      "Total0.5 Rs 390"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 5, productName: "750ml थम्स अप ₹35", quantity: 0.5, pricePerUnit: 780, totalAmount: 390 }
      ]
    );
  });

  it("does not treat price-led item names as the next serial number", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "4",
      "5/- \u0935\u0940\u0930\u093e \u0930\u093f\u0902\u0917",
      "Veera Ring1 Rs 52 Rs 52",
      "5",
      "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u0915\u093e\u091c\u0942 20/-",
      "Sobisco Kaju 106g6 Rs 18 Rs 108",
      "Total7 Rs 160"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 4, productName: "5/- \u0935\u0940\u0930\u093e \u0930\u093f\u0902\u0917", quantity: 1, totalAmount: 52 },
        { serialNo: 5, productName: "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u0915\u093e\u091c\u0942 20/-", quantity: 6, totalAmount: 108 }
      ]
    );
  });

  it("keeps zero-price free rows with their quantity", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "22Free Colgate1 Rs 0 Rs 0",
      "23",
      "\u0928\u093f\u0936\u093e \u0936\u093e\u092e\u094d\u092a\u0942 20/-",
      "Nisha Shampoo 20/-1 Rs 120 Rs 120",
      "Total2 Rs 120"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 22, productName: "Free Colgate", quantity: 1, pricePerUnit: 0, totalAmount: 0 },
        { serialNo: 23, productName: "\u0928\u093f\u0936\u093e \u0936\u093e\u092e\u094d\u092a\u0942 20/-", quantity: 1, pricePerUnit: 120, totalAmount: 120 }
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
      "20",
      "\u0938\u094b \u092c\u0940 \u0938\u094d\u0915\u094b",
      "Rs 5x12pic",
      "Sobisco Cream Milk1 Rs 52 Rs 52",
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
        { serialNo: 16, productName: "सोबीस्को चॉकोलेट 5/-", hsnOrBarcode: "", quantity: 1, totalAmount: 52 },
        { serialNo: 17, productName: "लोकल cake ₹5×12pic", hsnOrBarcode: "8902351777780", quantity: 1, totalAmount: 52 },
        { serialNo: 18, productName: "Fair And Lovely", hsnOrBarcode: "", quantity: 1, totalAmount: 115 },
        { serialNo: 19, productName: "13×16", hsnOrBarcode: "", quantity: 1, totalAmount: 70 },
        { serialNo: 20, productName: "सो बी स्को ₹5×12pic", hsnOrBarcode: "", quantity: 1, totalAmount: 52 }
      ]
    );
  });
});
