import pdfParse from "pdf-parse/lib/pdf-parse.js";

function cleanLines(text) {
  return (text || "")
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractInvoiceNo(lines) {
  const invoiceLine = lines.find((line) => /invoice\s*(no|number|#)?\s*\.?\s*[:\-]/i.test(line));
  const match = invoiceLine?.match(/invoice\s*(?:no|number|#)?\s*\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i);
  return match?.[1] || `VYP-${Date.now()}`;
}

function extractCustomerName(lines) {
  const billToIndex = lines.findIndex((line) => /^bill to$/i.test(line));
  if (billToIndex >= 0 && lines[billToIndex + 1]) {
    return lines[billToIndex + 1].trim();
  }

  const customerLine = lines.find((line) => /customer|party/i.test(line));
  const match = customerLine?.match(/(?:customer|party)\s*[:\-]?\s*(.+)$/i);
  return match?.[1]?.trim() || "Walk-in Customer";
}

function toNumber(value) {
  return Number.parseFloat(value?.toString().replace(/,/g, "") || "0");
}

function splitCompactBarcodeQuantity(hsnOrBarcode, quantity, hasExplicitQuantity) {
  const barcode = hsnOrBarcode?.toString().trim();
  if (!barcode || hasExplicitQuantity) return barcode;

  const roundedQuantity = Math.round(quantity);
  if (!Number.isFinite(roundedQuantity) || Math.abs(quantity - roundedQuantity) > 0.001) {
    return barcode;
  }

  const quantitySuffix = roundedQuantity.toString();
  if (!barcode.endsWith(quantitySuffix)) return barcode;

  const barcodeWithoutQuantity = barcode.slice(0, -quantitySuffix.length);
  return barcodeWithoutQuantity.length >= 6 ? barcodeWithoutQuantity : barcode;
}

function normalizeBarcodeField(hsnOrBarcode, quantity, hasExplicitQuantity) {
  const barcode = splitCompactBarcodeQuantity(hsnOrBarcode, quantity, hasExplicitQuantity);
  if (!barcode) return "";

  const barcodeAsNumber = toNumber(barcode);
  const looksLikeQuantity = /^\d+(?:\.\d+)?$/.test(barcode) && Math.abs(barcodeAsNumber - quantity) < 0.001;
  return !hasExplicitQuantity && looksLikeQuantity ? "" : barcode;
}

function logMalformedRow(row) {
  console.warn("Failed row:", row);
}

function buildItem(productName, hsnOrBarcode, quantity, pricePerUnit, totalAmount, invoiceLine) {
  const safeName = productName?.toString().trim();
  const safePrice = Number.isFinite(pricePerUnit) ? pricePerUnit : 0;
  const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;

  if (!safeName || safePrice <= 0 || safeTotal <= 0) return null;

  const hasExplicitQuantity = quantity !== null && quantity !== undefined && Number.isFinite(quantity);
  const calculatedQuantity = hasExplicitQuantity ? quantity : safeTotal / safePrice;
  if (!Number.isFinite(calculatedQuantity) || calculatedQuantity <= 0) return null;

  return {
    productName: safeName,
    hsnOrBarcode: normalizeBarcodeField(hsnOrBarcode, calculatedQuantity, hasExplicitQuantity),
    quantity: Number(calculatedQuantity.toFixed(3)),
    pricePerUnit: safePrice,
    totalAmount: safeTotal,
    invoiceLine: invoiceLine?.toString() || safeName
  };
}

function parseAmountTail(line) {
  if (!line || typeof line !== "string") return null;

  const matches = [...line.matchAll(/[\d,]+(?:\.\d+)?/g)];
  if (matches.length < 3) return null;

  const totalMatch = matches.at(-1);
  const priceMatch = matches.at(-2);
  const quantityMatch = matches.at(-3);
  const rawQuantity = quantityMatch[0];
  let productName = line.slice(0, quantityMatch.index).trim();
  let quantity = toNumber(rawQuantity);
  const pricePerUnit = toNumber(priceMatch[0]);
  const totalAmount = toNumber(totalMatch[0]);
  const inferredQuantity = pricePerUnit > 0 ? totalAmount / pricePerUnit : null;
  const roundedInferredQuantity = Math.round(inferredQuantity);
  const inferredQuantityText = Number.isFinite(roundedInferredQuantity) ? `${roundedInferredQuantity}` : "";

  if (
    inferredQuantityText &&
    Math.abs(inferredQuantity - roundedInferredQuantity) < 0.001 &&
    Math.abs(quantity - roundedInferredQuantity) > 0.001 &&
    rawQuantity.endsWith(inferredQuantityText)
  ) {
    productName = `${productName}${rawQuantity.slice(0, -inferredQuantityText.length)}`.trim();
    quantity = roundedInferredQuantity;
  }

  if (!productName) return null;

  return {
    productName,
    quantity,
    pricePerUnit,
    totalAmount
  };
}

function pushItem(itemLines, item, row) {
  if (item) {
    itemLines.push(item);
    return;
  }

  logMalformedRow(row);
}

function extractItems(lines) {
  const itemLines = [];
  const detailPattern = /^([A-Z0-9\-/]+)\s*(?:(\d+(?:\.\d+)?)\s+)?[^\d]*([\d,]+(?:\.\d+)?)\s+[^\d]*([\d,]+(?:\.\d+)?)/i;
  const combinedPattern = /^(\d+)\s*(.+?)\s+([A-Z0-9\-/]+)\s*(?:(\d+(?:\.\d+)?)\s+)?[^\d]*([\d,]+(?:\.\d+)?)\s+[^\d]*([\d,]+(?:\.\d+)?)/i;
  const stopPattern = /invoice amount in words|payment type|amounts|sub total|round off|total|balance|bank details/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || typeof line !== "string") continue;
    if (stopPattern.test(line)) break;

    const combined = line.match(combinedPattern);
    if (combined && !/^#/.test(line)) {
      pushItem(
        itemLines,
        buildItem(
          combined?.[2],
          combined?.[3],
          combined?.[4] ? toNumber(combined[4]) : null,
          toNumber(combined?.[5]),
          toNumber(combined?.[6]),
          line
        ),
        line
      );
      continue;
    }

    const compactCombined = line.match(/^(\d+)\s+(.+)/);
    const compactCombinedDetail = compactCombined ? parseAmountTail(compactCombined[2]) : null;
    if (compactCombinedDetail && !/^#/.test(line)) {
      pushItem(
        itemLines,
        buildItem(
          compactCombinedDetail.productName,
          null,
          compactCombinedDetail.quantity,
          compactCombinedDetail.pricePerUnit,
          compactCombinedDetail.totalAmount,
          line
        ),
        line
      );
      continue;
    }

    if (!/^\d+$/.test(line)) continue;

    const nameParts = [];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const nextLine = lines[cursor];
      if (!nextLine || typeof nextLine !== "string") {
        logMalformedRow(nextLine);
        cursor += 1;
        continue;
      }

      if (stopPattern.test(nextLine) || /^invoice$/i.test(nextLine) || /^#item name/i.test(nextLine)) {
        break;
      }

      const detail = nextLine.match(detailPattern);
      if (detail) {
        const productName = nameParts.join(" ").trim();
        const row = `${productName} ${nextLine}`.trim();
        pushItem(
          itemLines,
          buildItem(
            productName,
            detail?.[1],
            detail?.[2] ? toNumber(detail[2]) : null,
            toNumber(detail?.[3]),
            toNumber(detail?.[4]),
            row
          ),
          row
        );

        index = cursor;
        break;
      }

      const compactDetail = parseAmountTail(nextLine);
      if (compactDetail) {
        const productName = [...nameParts, compactDetail.productName].filter(Boolean).join(" ").trim();
        const row = `${productName} ${nextLine}`.trim();
        pushItem(
          itemLines,
          buildItem(
            productName,
            null,
            compactDetail.quantity,
            compactDetail.pricePerUnit,
            compactDetail.totalAmount,
            row
          ),
          row
        );

        index = cursor;
        break;
      }

      if (/^\d+$/.test(nextLine)) break;
      nameParts.push(nextLine);
      cursor += 1;
    }
  }

  const merged = new Map();
  for (const item of itemLines) {
    if (!item?.productName || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      logMalformedRow(item);
      continue;
    }

    const key = `${item.productName.toLowerCase()}|${item.hsnOrBarcode || ""}`;
    const previous = merged.get(key);
    if (previous) {
      previous.quantity = Number((previous.quantity + item.quantity).toFixed(3));
      previous.totalAmount = Number(((previous.totalAmount || 0) + (item.totalAmount || 0)).toFixed(2));
    } else {
      merged.set(key, { ...item });
    }
  }

  return Array.from(merged.values());
}

export async function parseVyaparInvoice(buffer) {
  try {
    const parsed = await pdfParse(buffer);
    console.log("Extracted PDF text:", parsed?.text || "");

    const lines = cleanLines(parsed?.text);
    const items = extractItems(lines);

    if (!items.length) {
      throw Object.assign(new Error("No invoice items found. Please check the Vyapar PDF format."), { statusCode: 422 });
    }

    return {
      invoiceNo: extractInvoiceNo(lines),
      customerName: extractCustomerName(lines),
      items,
      rawText: parsed?.text || ""
    };
  } catch (error) {
    console.error("Parser error:", error);
    throw Object.assign(new Error("Unsupported invoice format"), { statusCode: 422, cause: error });
  }
}
