import pdfParse from "pdf-parse/lib/pdf-parse.js";

function normalizePdfText(text = "") {
  return text
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\u20b9|â‚¹/g, " Rs ")
    .replace(/Ã—|×|✕|✖/g, "x")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
}

function cleanLines(text) {
  return normalizePdfText(text || "")
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

function normalizeNameKey(value = "") {
  return value
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanProductName(value = "") {
  return value
    .toString()
    .replace(/^#?\s*\d{1,3}\s+/, "")
    .replace(/\b(item\s*name|product\s*name|description|hsn\/?sac|hsn|barcode|qty|quantity|rate|price|amount|total)\b/gi, " ")
    .replace(/\b(rs|inr)\b/gi, " ")
    .replace(/[|:_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyHeaderLine(line = "") {
  const normalized = line.toString().toLowerCase();
  return (
    /^#/.test(normalized) ||
    /\b(item\s*name|product\s*name|description)\b/.test(normalized) ||
    /\b(hsn|barcode)\b.*\b(qty|quantity)\b/.test(normalized) ||
    /\b(qty|quantity)\b.*\b(rate|price)\b.*\b(amount|total)\b/.test(normalized)
  );
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
  const safeName = cleanProductName(productName);
  const safePrice = Number.isFinite(pricePerUnit) ? pricePerUnit : 0;
  const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;

  if (!safeName || isLikelyHeaderLine(safeName) || safePrice <= 0 || safeTotal <= 0) return null;

  const hasExplicitQuantity = quantity !== null && quantity !== undefined && Number.isFinite(quantity);
  const calculatedQuantity = hasExplicitQuantity ? quantity : safeTotal / safePrice;
  if (!Number.isFinite(calculatedQuantity) || calculatedQuantity <= 0 || calculatedQuantity > 100000) return null;

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
  if (isLikelyHeaderLine(line)) return null;

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

function getItemSectionLines(lines) {
  const startIndex = lines.findIndex((line) => (
    /^#\s*item\s*name/i.test(line) ||
    (/\b(item\s*name|product\s*name|description)\b/i.test(line) && /\b(qty|quantity|rate|amount|total)\b/i.test(line))
  ));
  const stopPattern = /invoice amount in words|payment type|amounts|sub total|taxable amount|total tax|cgst|sgst|igst|round off|grand total|total|balance|bank details/i;
  if (startIndex < 0) return [];

  const section = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPattern.test(line)) break;
    if (!isLikelyHeaderLine(line)) section.push(line);
  }

  return section;
}

function chunkVyaparRows(lines) {
  const rows = [];
  let current = null;

  const isCurrentRowComplete = () => {
    if (!current?.parts.length) return false;
    return Boolean(parseVyaparRow(current.parts.join(" ")));
  };

  for (const line of getItemSectionLines(lines)) {
    const serialMatch = line.match(/^(\d{1,3})(?![\d,])\s*(.*)$/);
    if (serialMatch) {
      if (!current) {
        current = { parts: [] };
        if (serialMatch[2]) current.parts.push(serialMatch[2]);
        continue;
      }

      if (isCurrentRowComplete()) {
        rows.push(current.parts.join(" "));
        current = { parts: [] };
        if (serialMatch[2]) current.parts.push(serialMatch[2]);
        continue;
      }

      current.parts.push(line);
      continue;
    }

    if (!current) continue;
    current.parts.push(line);
  }

  if (current?.parts.length) rows.push(current.parts.join(" "));
  return rows;
}

function extractVyaparAmounts(row) {
  const currencyNumbers = [...row.matchAll(/(?:Rs|INR)\s*([\d,]+(?:\.\d+)?)/gi)];
  if (currencyNumbers.length >= 2) {
    const priceMatch = currencyNumbers.at(-2);
    const totalMatch = currencyNumbers.at(-1);
    return {
      pricePerUnit: toNumber(priceMatch[1]),
      totalAmount: toNumber(totalMatch[1]),
      beforeAmounts: row.slice(0, priceMatch.index).trim()
    };
  }

  const matches = [...row.matchAll(/[\d,]+(?:\.\d+)?/g)];
  if (matches.length < 2) return null;

  const priceMatch = matches.at(-2);
  const totalMatch = matches.at(-1);
  return {
    pricePerUnit: toNumber(priceMatch[0]),
    totalAmount: toNumber(totalMatch[0]),
    beforeAmounts: row.slice(0, priceMatch.index).trim()
  };
}

function extractQuantityFromName(name) {
  const packMatch = name.match(/(?:Rs\s*)?\d+(?:\.\d+)?\s*x\s*(\d+(?:\.\d+)?)/i);
  return packMatch ? toNumber(packMatch[1]) : null;
}

function parseVyaparRow(row) {
  if (!row || isLikelyHeaderLine(row)) return null;

  const amounts = extractVyaparAmounts(row);
  if (!amounts || amounts.pricePerUnit <= 0 || amounts.totalAmount <= 0) return null;

  const inferredQuantity = amounts.totalAmount / amounts.pricePerUnit;
  const roundedInferredQuantity = Math.round(inferredQuantity);
  const spacedBarcodeQuantityMatch = amounts.beforeAmounts.match(/(?:^|\s)(\d{6,14})\s+(\d+(?:\.\d+)?)$/);
  const tailBarcodeMatch = amounts.beforeAmounts.match(/(\d{6,})(\d{1,3})?$/);
  const explicitPackQuantity = extractQuantityFromName(amounts.beforeAmounts);

  let hsnOrBarcode = "";
  let quantity = Number.isFinite(explicitPackQuantity) && explicitPackQuantity > 0 ? explicitPackQuantity : null;
  let productName = amounts.beforeAmounts;

  if (spacedBarcodeQuantityMatch) {
    hsnOrBarcode = spacedBarcodeQuantityMatch[1];
    quantity = toNumber(spacedBarcodeQuantityMatch[2]);
    productName = amounts.beforeAmounts.slice(0, spacedBarcodeQuantityMatch.index).trim();
  } else if (tailBarcodeMatch) {
    const compactCode = tailBarcodeMatch[0];
    const inferredText = Number.isFinite(roundedInferredQuantity) ? roundedInferredQuantity.toString() : "";
    if (
      inferredText &&
      compactCode.endsWith(inferredText) &&
      Math.abs(inferredQuantity - roundedInferredQuantity) < 0.001 &&
      compactCode.length - inferredText.length >= 6
    ) {
      hsnOrBarcode = compactCode.slice(0, -inferredText.length);
      quantity = roundedInferredQuantity;
    } else {
      hsnOrBarcode = compactCode;
    }

    productName = amounts.beforeAmounts.slice(0, tailBarcodeMatch.index).trim();

    if (hsnOrBarcode.length > 13 && productName.endsWith("Rs")) {
      const leadingNameDigits = hsnOrBarcode.slice(0, -13);
      hsnOrBarcode = hsnOrBarcode.slice(-13);
      productName = `${productName}${leadingNameDigits}`.trim();
    }
  }

  return buildItem(
    productName,
    hsnOrBarcode,
    quantity,
    amounts.pricePerUnit,
    amounts.totalAmount,
    row
  );
}

function extractVyaparItems(lines) {
  return chunkVyaparRows(lines)
    .map(parseVyaparRow)
    .filter(Boolean);
}

function pushItem(itemLines, item, row) {
  if (item) {
    itemLines.push(item);
    return;
  }

  logMalformedRow(row);
}

function mergeInvoiceItems(items) {
  const merged = new Map();
  for (const item of items) {
    if (!item?.productName || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      logMalformedRow(item);
      continue;
    }

    const key = `${normalizeNameKey(item.productName)}|${item.hsnOrBarcode || ""}|${item.pricePerUnit || 0}`;
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

function extractItems(lines) {
  const candidates = [...extractVyaparItems(lines)];
  if (candidates.length) return mergeInvoiceItems(candidates);

  const itemLines = [];
  const detailPattern = /^([A-Z0-9\-/]+)\s*(?:(\d+(?:\.\d+)?)\s+)?[^\d]*([\d,]+(?:\.\d+)?)\s+[^\d]*([\d,]+(?:\.\d+)?)/i;
  const combinedPattern = /^(\d+)\s*(.+?)\s+([A-Z0-9\-/]+)\s*(?:(\d+(?:\.\d+)?)\s+)?[^\d]*([\d,]+(?:\.\d+)?)\s+[^\d]*([\d,]+(?:\.\d+)?)/i;
  const stopPattern = /invoice amount in words|payment type|amounts|sub total|taxable amount|total tax|cgst|sgst|igst|round off|grand total|total|balance|bank details/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || typeof line !== "string" || isLikelyHeaderLine(line)) continue;
    if (stopPattern.test(line)) break;

    const vyaparRow = parseVyaparRow(line);
    if (vyaparRow) {
      pushItem(itemLines, vyaparRow, line);
      continue;
    }

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

      if (stopPattern.test(nextLine) || /^invoice$/i.test(nextLine) || isLikelyHeaderLine(nextLine)) {
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

  return mergeInvoiceItems(itemLines);
}

export async function parseVyaparInvoice(buffer) {
  try {
    const parsed = await pdfParse(buffer);
    console.log("Extracted PDF text:", parsed?.text || "");

    const lines = cleanLines(parsed?.text);
    if (lines.length < 5) {
      throw Object.assign(new Error("PDF has no readable invoice text. Please upload the original Vyapar PDF, not a photo or scanned PDF."), { statusCode: 422 });
    }

    const items = extractItems(lines).map((item, index) => ({
      ...item,
      serialNo: index + 1
    }));

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
    const message = error.statusCode === 422 ? error.message : "Unsupported invoice format";
    throw Object.assign(new Error(message), { statusCode: 422, cause: error });
  }
}
