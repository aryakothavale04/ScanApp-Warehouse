import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractItems, pdfParserInternals } from "../src/services/pdfParser.js";

const {
  buildParserDiagnostics,
  calculateInvoiceTotals,
  extractCustomerName,
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

  it("extracts Bill To customer names when invoice details share the same header row", () => {
    assert.equal(
      extractCustomerName([
        "Invoice",
        "Bill To Invoice Details",
        "Yelwankar Co. Invoice No.: 14192",
        "Contact No.: 8850421719 Date: 15-06-2026"
      ]),
      "Yelwankar Co."
    );

    assert.equal(
      extractCustomerName([
        "Invoice",
        "Bill To Invoice Details",
        "Deep Kirana Invoice No.: 14193",
        "Contact No.: 9049488280 Date: 15-06-2026"
      ]),
      "Deep Kirana"
    );
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

  it("uses only the item-name text when text item code is glued to it", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "1",
      "SA \u0932\u0902\u091a \u092c\u0949\u0915\u094d\u0938 5/-Lunch Box1 Rs 52 Rs 52",
      "2",
      "Rk \u092c\u094d\u0932\u0947\u0921Rk Blade1 Rs 42 Rs 42",
      "3",
      "\u20b910 Vanilla Cone 40ml1 Rs 306 Rs 306",
      "4",
      "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u0915\u0947\u0915 \u092e\u0901\u0917\u094b \u092e\u0901\u0917\u094b \u20b95\u00d712pic 89023517777731 Rs 52 Rs 52",
      "Total4 Rs 452"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        productName: item.productName,
        hsnOrBarcode: item.hsnOrBarcode,
        quantity: item.quantity
      })),
      [
        { serialNo: 1, productName: "SA \u0932\u0902\u091a \u092c\u0949\u0915\u094d\u0938 5/-", hsnOrBarcode: "", quantity: 1 },
        { serialNo: 2, productName: "Rk \u092c\u094d\u0932\u0947\u0921", hsnOrBarcode: "", quantity: 1 },
        { serialNo: 3, productName: "\u20b910 Vanilla Cone 40ml", hsnOrBarcode: "", quantity: 1 },
        { serialNo: 4, productName: "\u0938\u094b\u092c\u0940\u0938\u094d\u0915\u094b \u0915\u0947\u0915 \u092e\u0901\u0917\u094b \u092e\u0901\u0917\u094b \u20b95\u00d712pic", hsnOrBarcode: "8902351777773", quantity: 1 }
      ]
    );
  });

  it("preserves compact rows when serials are glued to digit-led product names", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "11/- \u091f\u093e\u0907\u092e\u092a\u093e\u0938Timepass Rs 12 Rs 52 Rs 104",
      "2Rs 10 \u091c\u0940\u0930\u093e \u0938\u094b\u0921\u093eJeera Soda 10/-1 Rs 170 Rs 170",
      "3Rs 10 \u092e\u0901\u0917\u094bMango 10/-2 Rs 170 Rs 340",
      "4Rs 10 \u0938\u094d\u092a\u094d\u0930\u093e\u0908\u091fSprite 10/-2 Rs 170 Rs 340",
      "5250ml \u0925\u092e\u094d\u0938 \u0905\u092a Rs 20Thums Ups 250ml1 Rs 500 Rs 500",
      "6250ml \u0938\u094d\u092a\u094d\u0930\u093e\u0908\u091f Rs 20Sprite 250ml1 Rs 500 Rs 500",
      "7250ml \u092e\u093e\u091d\u093e Rs 20Maza Rs 200.5 Rs 540 Rs 270",
      "8750ml \u0938\u094d\u092a\u094d\u0930\u093e\u0908\u091f Rs 35Sprite 600ml1 Rs 780 Rs 780",
      "9\u0911\u0932\u0935\u0940\u0928 \u0921\u093e\u0930\u094d\u0915 1/-Allwin Dark1 Rs 100 Rs 100",
      "10\u091a\u093f\u0902\u091f\u0942 \u0938\u094d\u091f\u094d\u0930\u093e\u092c\u0947\u0930\u0940 \u091c\u093e\u0930Chintu strawberry jar1 Rs 110 Rs 110",
      "11\u0938\u0947\u0902\u091f\u0930 \u092b\u094d\u0930\u0941\u091fCenter fruit1 Rs 190 Rs 190",
      "12LD \u00bc kg1 Rs 210 Rs 210",
      "13LD 1kg1 Rs 210 Rs 210",
      "14\u0938\u094d\u0915\u094d\u0930\u092c\u0930 10/-Scruber 10/-1 Rs 50 Rs 50",
      "Total16.5 Rs 3,874"
    ]);

    assert.deepEqual(items.map((item) => item.serialNo), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    assert.deepEqual(items.map((item) => item.quantity), [2, 1, 2, 2, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(items[0].productName, "1/- \u091f\u093e\u0907\u092e\u092a\u093e\u0938");
    assert.equal(items[4].productName, "250ml \u0925\u092e\u094d\u0938 \u0905\u092a \u20b920");
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

  it("drops text item-code cells without merging them into item names", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "3",
      "10/- SpriteSprite 10/-1 Rs 170 Rs 170",
      "15",
      "Sobisco Cream Orange 5/-Sobisco Cream Orange 31.8g1 Rs 52 Rs 52",
      "23",
      "Shaboo 1kgShaboo2 Rs 150 Rs 300",
      "24",
      "Kela Chips 1\u20442kgKela chips 1\u20442kg2 Rs 90 Rs 180",
      "25",
      "Kharidal 1kgKharidaal1 Rs 130 Rs 130"
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
        { serialNo: 3, productName: "10/- Sprite", hsnOrBarcode: "", quantity: 1, pricePerUnit: 170, totalAmount: 170 },
        { serialNo: 15, productName: "Sobisco Cream Orange 5/-", hsnOrBarcode: "", quantity: 1, pricePerUnit: 52, totalAmount: 52 },
        { serialNo: 23, productName: "Shaboo 1kg", hsnOrBarcode: "", quantity: 2, pricePerUnit: 150, totalAmount: 300 },
        { serialNo: 24, productName: "Kela Chips 1\u20442kg", hsnOrBarcode: "", quantity: 2, pricePerUnit: 90, totalAmount: 180 },
        { serialNo: 25, productName: "Kharidal 1kg", hsnOrBarcode: "", quantity: 1, pricePerUnit: 130, totalAmount: 130 }
      ]
    );
  });

  it("splits compact pack price barcode and quantity cells", () => {
    const items = extractItems([
      "#Item nameItem codeQuantityPrice/ unitAmount",
      "7",
      "750ml Sprite Rs 3589017640329670.5 Rs 780 Rs 390",
      "29",
      "750ml Sprite Rs 35890176403296712 Rs 32.5 Rs 390",
      "30",
      "Comfert Rs 43 Rs 37 Rs 111",
      "31",
      "\u0935\u0938\u094d\u092a\u0930 XL Rs 4512 Rs 40 Rs 480"
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
        { serialNo: 7, productName: "750ml Sprite \u20b935", hsnOrBarcode: "8901764032967", quantity: 0.5, pricePerUnit: 780, totalAmount: 390 },
        { serialNo: 29, productName: "750ml Sprite \u20b935", hsnOrBarcode: "8901764032967", quantity: 12, pricePerUnit: 32.5, totalAmount: 390 },
        { serialNo: 30, productName: "Comfert \u20b94", hsnOrBarcode: "", quantity: 3, pricePerUnit: 37, totalAmount: 111 },
        { serialNo: 31, productName: "\u0935\u0938\u094d\u092a\u0930 XL \u20b945", hsnOrBarcode: "", quantity: 12, pricePerUnit: 40, totalAmount: 480 }
      ]
    );
  });

  it("parses column-rendered continuation pages and wrapped price rows", () => {
    const items = extractItems([
      "#\tItem name\tItem code\tQuantity\tAmount",
      "unit",
      "33 Sobisco Maggi 5/-\t8902351111157\t2\tRs 48\tRs 96",
      "Rs",
      "34 250ml Sprite Rs20\t8901764032912\t14\tRs 250",
      "17.86",
      "Rs",
      "35 250ml Thums Up Rs20\t8901764042911\t14\tRs 250",
      "17.86",
      "36 Blade Rk\t8906167130258\t1\tRs 42\tRs 42",
      "Total\t31\tRs 638"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        itemName: item.itemName,
        itemCode: item.itemCode,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 33, itemName: "Sobisco Maggi 5/-", itemCode: "8902351111157", quantity: 2, pricePerUnit: 48, totalAmount: 96 },
        { serialNo: 34, itemName: "250ml Sprite ₹20", itemCode: "8901764032912", quantity: 14, pricePerUnit: 17.86, totalAmount: 250 },
        { serialNo: 35, itemName: "250ml Thums Up ₹20", itemCode: "8901764042911", quantity: 14, pricePerUnit: 17.86, totalAmount: 250 },
        { serialNo: 36, itemName: "Blade Rk", itemCode: "8906167130258", quantity: 1, pricePerUnit: 42, totalAmount: 42 }
      ]
    );
  });

  it("keeps trailing visual item-code barcodes out of item names", () => {
    const items = extractItems([
      "#\tItem name\tItem code\tQuantity\tPrice/ unit\tAmount",
      "2\tSobisco Puff Strawberry 5/- 8902351997577\t2\tRs 52\tRs 104",
      "3\tSobisco Cream Milk 5/-\t8902351998581\t2\tRs 52\tRs 104",
      "6\tSobisco Cup Cake Mango 5/- 8902351777773\t1\tRs 52\tRs 52",
      "7\tSobisco Cup Cake Vanilla 5/- 8902351333146\t1\tRs 52\tRs 52",
      "Total\t6\tRs 312"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        itemName: item.itemName,
        itemCode: item.itemCode,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 2, itemName: "Sobisco Puff Strawberry 5/-", itemCode: "8902351997577", quantity: 2, pricePerUnit: 52, totalAmount: 104 },
        { serialNo: 3, itemName: "Sobisco Cream Milk 5/-", itemCode: "8902351998581", quantity: 2, pricePerUnit: 52, totalAmount: 104 },
        { serialNo: 6, itemName: "Sobisco Cup Cake Mango 5/-", itemCode: "8902351777773", quantity: 1, pricePerUnit: 52, totalAmount: 52 },
        { serialNo: 7, itemName: "Sobisco Cup Cake Vanilla 5/-", itemCode: "8902351333146", quantity: 1, pricePerUnit: 52, totalAmount: 52 }
      ]
    );
  });

  it("drops footer markers before the next page table row", () => {
    const items = extractItems([
      "#\tItem name\tItem code\tQuantity\tAmount",
      "29\t10/- Sprite\t38613355690\t1\tRs 170\tRs 170",
      "www.vyaparapp.in",
      "Page 1",
      "#\tItem name\tItem code\tQuantity\tAmount",
      "unit",
      "30\tSA Shev Bundi 5/-\t38658899723\t3\tRs 52\tRs 156",
      "Total\t4\tRs 326"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        itemName: item.itemName,
        itemCode: item.itemCode,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 29, itemName: "10/- Sprite", itemCode: "38613355690", quantity: 1, pricePerUnit: 170, totalAmount: 170 },
        { serialNo: 30, itemName: "SA Shev Bundi 5/-", itemCode: "38658899723", quantity: 3, pricePerUnit: 52, totalAmount: 156 }
      ]
    );
  });

  it("keeps wrapped item names with split decimal prices in serial order", () => {
    const items = extractItems([
      "#\tItem name\tItem code\tQuantity\tAmount",
      "Rs20 Butterscotch Cone\tRs",
      "2\t1\tRs 400.8",
      "80ml\t400.8",
      "4\tRs10 Choco Crunch 30ml\t1 Rs 270\tRs 270",
      "Rs10 Strawberry Crunch",
      "5\t1 Rs 270\tRs 270",
      "30ml",
      "Rs",
      "13 Rs35 Choco Nut Bar 70ml\t1 642.9 Rs 642.95",
      "5",
      "Rs50 Black And White Cone",
      "14\t1 Rs 425\tRs 425",
      "120ml",
      "Total\t4\tRs 1738.75"
    ]);

    assert.deepEqual(
      items.map((item) => ({
        serialNo: item.serialNo,
        itemName: item.itemName,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        totalAmount: item.totalAmount
      })),
      [
        { serialNo: 2, itemName: "₹20 Butterscotch Cone 80ml", quantity: 1, pricePerUnit: 400.8, totalAmount: 400.8 },
        { serialNo: 4, itemName: "₹10 Choco Crunch 30ml", quantity: 1, pricePerUnit: 270, totalAmount: 270 },
        { serialNo: 5, itemName: "₹10 Strawberry Crunch 30ml", quantity: 1, pricePerUnit: 270, totalAmount: 270 },
        { serialNo: 13, itemName: "₹35 Choco Nut Bar 70ml", quantity: 1, pricePerUnit: 642.95, totalAmount: 642.95 },
        { serialNo: 14, itemName: "₹50 Black And White Cone 120ml", quantity: 1, pricePerUnit: 425, totalAmount: 425 }
      ]
    );
  });
});
