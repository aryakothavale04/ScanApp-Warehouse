import pdfParse from "pdf-parse/lib/pdf-parse.js";

const VYAPAR_TABLE_COLUMNS = ["#", "Item name", "Item code", "Quantity", "Price/unit", "Amount"];

function normalizePdfText(text = "") {
  return text
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\u20b9|â‚¹/g, " Rs ")
    .replace(/Ã—|×|✕|✖/g, "x")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
}

function normalizeTableHeaderLine(line = "") {
  const normalized = line.toString().trim();
  const compact = normalized.toLowerCase().replace(/[^a-z#]/g, "");
  if (
    compact === "#itemnameitemcodequantitypriceunitamount" ||
    compact === "itemnameitemcodequantitypriceunitamount"
  ) {
    return VYAPAR_TABLE_COLUMNS.join("\t");
  }

  return normalized;
}

function cleanLines(text) {
  return normalizePdfText(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S\t]+/g, " ").replace(/\t+/g, "\t").trim())
    .map(normalizeTableHeaderLine)
    .filter(Boolean);
}

function renderPageWithColumns(pageData) {
  return pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: true
  }).then((textContent) => {
    const rows = [];
    const yTolerance = 3;

    for (const item of textContent.items || []) {
      const text = normalizePdfText(item.str || "").trim();
      if (!text) continue;

      const [, , , , x, y] = item.transform || [];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= yTolerance);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }

      row.items.push({
        text,
        x,
        width: Number.isFinite(item.width) ? item.width : text.length * 5
      });
    }

    return rows
      .sort((a, b) => b.y - a.y)
      .map((row) => {
        const parts = row.items.sort((a, b) => a.x - b.x);
        let line = "";
        let previousRight = null;

        for (const part of parts) {
          if (!line) {
            line = part.text;
          } else {
            const gap = previousRight === null ? 0 : part.x - previousRight;
            line += gap > 12 ? `\t${part.text}` : ` ${part.text}`;
          }

          previousRight = Math.max(previousRight ?? -Infinity, part.x + part.width);
        }

        return line.replace(/[^\S\t]+/g, " ").replace(/\t+/g, "\t").trim();
      })
      .filter(Boolean)
      .join("\n");
  });
}

function extractInvoiceNo(lines) {
  const invoiceLine = lines.find((line) => /invoice\s*(no|number|#)\s*\.?\s*[:\-#]/i.test(line)) ||
    lines.find((line) => /invoice\s*(?:no|number|#)?\s*\.?\s*[:\-#]/i.test(line));
  const match = invoiceLine?.match(/invoice\s*(?:no|number|#)?\s*\.?\s*[:\-#]?\s*([A-Z0-9\-\/]+)/i);
  return match?.[1] || `VYP-${Date.now()}`;
}

function extractDate(lines) {
  const dateLine = lines.find((line) => /\b(invoice\s*)?date\b/i.test(line));
  const match = dateLine?.match(/\b(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})\b/);
  return match?.[1]?.replace(/[/.]/g, "-") || "";
}

function extractContact(lines) {
  const contactLine = lines.find((line) => /\b(phone|mobile|contact|tel)\b/i.test(line));
  const match = contactLine?.match(/(?:\+?\d[\d\s-]{7,}\d)/);
  return match?.[0]?.replace(/\s+/g, "-") || "";
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
  return Number.parseFloat(value?.toString().replace(/,/g, "").replace(/(?<=\d)\s+(?=\d)/g, "") || "0");
}

function findAmountAfterLabel(lines, labels, { reverse = true } = {}) {
  const labelPattern = new RegExp(`\\b(?:${labels.join("|")})\\b`, "i");
  const searchLines = reverse ? [...lines].reverse() : lines;
  const line = searchLines.find((entry) => labelPattern.test(entry));
  if (!line) return null;

  const matches = [...line.matchAll(/[\d,]+(?:\.\d+)?/g)];
  return matches.length ? toNumber(matches.at(-1)[0]) : null;
}

function findSignedAmountAfterLabel(lines, labels, options) {
  const labelPattern = new RegExp(`\\b(?:${labels.join("|")})\\b`, "i");
  const searchLines = options?.reverse === false ? lines : [...lines].reverse();
  const line = searchLines.find((entry) => labelPattern.test(entry));
  if (!line) return null;

  const matches = [...line.matchAll(/-?\s*(?:Rs|INR)?\s*([\d,]+(?:\.\d+)?)/gi)];
  if (!matches.length) return null;

  const value = toNumber(matches.at(-1)[1]);
  return /-\s*(?:Rs|INR|₹)?\s*[\d,]+(?:\.\d+)?/i.test(line) ? -value : value;
}

function extractSummaryFields(lines) {
  const paymentTypeIndex = lines.findIndex((line) => /\bpayment\s*(?:type|mode)\b/i.test(line));
  const paymentType = paymentTypeIndex >= 0
    ? lines[paymentTypeIndex].replace(/.*payment\s*(?:type|mode)\s*[:\-]?/i, "").trim() || lines[paymentTypeIndex + 1]?.trim() || ""
    : "";

  return {
    subtotal: findAmountAfterLabel(lines, ["sub\\s*total", "subtotal"]),
    total: findAmountAfterLabel(lines, ["grand\\s*total", "total"]),
    roundOff: findSignedAmountAfterLabel(lines, ["round\\s*off"]),
    balance: findAmountAfterLabel(lines, ["^balance", "balance\\s*due"], { reverse: false }),
    previousBalance: findAmountAfterLabel(lines, ["previous\\s*balance"]),
    currentBalance: findAmountAfterLabel(lines, ["current\\s*balance"]),
    paymentType,
    paidAmount: findAmountAfterLabel(lines, ["paid", "received", "payment"])
  };
}

function calculateInvoiceTotals(items = [], summary = {}) {
  const itemsTotal = Number(items.reduce((sum, item) => sum + (item?.totalAmount || 0), 0).toFixed(2));
  const totalBeforeRoundOff = summary.subtotal ?? itemsTotal;
  const roundOff = Number.isFinite(summary.roundOff) ? summary.roundOff : 0;
  const totalAfterRoundOff = Number((totalBeforeRoundOff + roundOff).toFixed(2));
  const total = summary.total ?? totalAfterRoundOff;

  return {
    itemsTotal,
    totalBeforeRoundOff,
    totalAfterRoundOff,
    total,
    totalMatchesAfterRoundOff: Math.abs(totalAfterRoundOff - total) < 0.01
  };
}

function buildParserDiagnostics(items = []) {
  const serials = items.map((item) => item?.serialNo).filter(Number.isFinite);
  const highestSerial = serials.length ? Math.max(...serials) : 0;
  const missingSerials = [];
  for (let serialNo = 1; serialNo <= highestSerial; serialNo += 1) {
    if (!serials.includes(serialNo)) missingSerials.push(serialNo);
  }

  const duplicateSerials = serials.filter((serialNo, index) => serials.indexOf(serialNo) !== index);
  const fallbackRows = items
    .filter((item) => !item?.itemName || !item?.quantity || !item?.pricePerUnit || !item?.totalAmount)
    .map((item) => item?.serialNo)
    .filter(Number.isFinite);

  return {
    itemCount: items.length,
    firstSerial: serials[0] ?? null,
    lastSerial: serials.at(-1) ?? null,
    highestSerial,
    missingSerials,
    duplicateSerials,
    fallbackRows,
    rowOrderPreserved: serials.every((serialNo, index) => index === 0 || serialNo >= serials[index - 1])
  };
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
    .normalize("NFKC")
    .replace(/^#?\s*\d{1,3}\s+/, "")
    .replace(/\b(item\s*name|product\s*name|description|hsn\/?sac|hsn|barcode|qty|quantity|rate|price|amount|total)\b/gi, " ")
    .replace(/\b(rs|inr)\b/gi, " ")
    .replace(/[|:_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEnglishProductName(value = "") {
  const cleaned = cleanProductName(value);
  return cleaned
    .replace(/\s+(?:1|5)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyHeaderLine(line = "") {
  const normalized = line.toString().toLowerCase();
  const compact = normalized.replace(/[^a-z#]/g, "");
  return (
    /^#/.test(normalized) ||
    compact.includes("itemnameitemcodequantitypriceunitamount") ||
    /\b(item\s*name|product\s*name|description)\b/.test(normalized) ||
    /\b(hsn|barcode)\b.*\b(qty|quantity)\b/.test(normalized) ||
    /\b(qty|quantity)\b.*\b(rate|price)\b.*\b(amount|total)\b/.test(normalized)
  );
}

function isItemTableHeaderLine(line = "") {
  const normalized = line.toString().toLowerCase();
  const compact = normalized.replace(/[^a-z]/g, "");
  return (
    /^#\s*item\s*name/i.test(line) ||
    compact.includes("itemnameitemcodequantitypriceunitamount") ||
    (
      /\b(item\s*name|product\s*name|description)\b/i.test(normalized) &&
      /\b(qty|quantity|rate|price|amount|total)\b/i.test(normalized)
    )
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

function buildItem(productName, hsnOrBarcode, quantity, pricePerUnit, totalAmount, invoiceLine, options = {}) {
  let safeName = cleanEnglishProductName(productName);
  const packPrice = Number.isFinite(options.packPrice) && options.packPrice > 0 ? options.packPrice : null;
  if (
    packPrice &&
    !new RegExp(`(?:₹|Rs\\s*)?${packPrice}\\s*/?-?\\b`, "i").test(safeName)
  ) {
    safeName = `${safeName} ₹${packPrice}`.trim();
  }
  const safePrice = Number.isFinite(pricePerUnit) ? pricePerUnit : 0;
  const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;

  if (!safeName || isLikelyHeaderLine(safeName) || safePrice <= 0 || safeTotal <= 0) return null;

  const hasExplicitQuantity = quantity !== null && quantity !== undefined && Number.isFinite(quantity);
  const calculatedQuantity = hasExplicitQuantity ? quantity : safeTotal / safePrice;
  if (!Number.isFinite(calculatedQuantity) || calculatedQuantity <= 0 || calculatedQuantity > 100000) return null;

  return {
    itemName: safeName,
    itemCode: normalizeBarcodeField(hsnOrBarcode, calculatedQuantity, hasExplicitQuantity),
    productName: safeName,
    hsnOrBarcode: normalizeBarcodeField(hsnOrBarcode, calculatedQuantity, hasExplicitQuantity),
    quantity: Number(calculatedQuantity.toFixed(3)),
    unitPrice: safePrice,
    amount: safeTotal,
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
    isItemTableHeaderLine(line)
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
  const columns = row.split("\t").map((part) => part.trim()).filter(Boolean);
  if (columns.length >= 4) {
    const amount = toNumber(columns.at(-1));
    const unitPrice = toNumber(columns.at(-2));
    const quantity = toNumber(columns.at(-3));
    if (unitPrice > 0 && amount > 0 && quantity > 0) {
      return {
        pricePerUnit: unitPrice,
        totalAmount: amount,
        explicitQuantity: quantity,
        beforeAmounts: columns.slice(0, -3).join(" ").trim()
      };
    }
  }

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
  const packMatch = name.match(/(?:^|\s)(?:Rs\s*)?\d+(?:\.\d+)?\s+x\s+(\d+(?:\.\d+)?)(?:\s|$)/i);
  return packMatch ? toNumber(packMatch[1]) : null;
}

function splitTrailingInferredQuantity(name, inferredQuantity) {
  const roundedInferredQuantity = Math.round(inferredQuantity);
  if (
    !Number.isFinite(inferredQuantity) ||
    !Number.isFinite(roundedInferredQuantity) ||
    Math.abs(inferredQuantity - roundedInferredQuantity) > 0.001
  ) {
    return null;
  }

  const trailingQuantityMatch = name.match(/(?:^|\s)(\d+(?:\.\d+)?)$/);
  if (!trailingQuantityMatch) return null;

  const trailingQuantity = toNumber(trailingQuantityMatch[1]);
  if (Math.abs(trailingQuantity - roundedInferredQuantity) > 0.001) return null;

  const productName = name.slice(0, trailingQuantityMatch.index).trim();
  return productName ? { productName, quantity: roundedInferredQuantity } : null;
}

function splitAttachedInferredQuantity(name, inferredQuantity) {
  const roundedInferredQuantity = Math.round(inferredQuantity);
  if (
    !Number.isFinite(inferredQuantity) ||
    !Number.isFinite(roundedInferredQuantity) ||
    Math.abs(inferredQuantity - roundedInferredQuantity) > 0.001
  ) {
    return null;
  }

  const inferredText = roundedInferredQuantity.toString();
  const match = name.match(/(\d+)$/);
  if (!match || !match[1].endsWith(inferredText)) return null;

  const keptDigits = match[1].slice(0, -inferredText.length);
  const productName = `${name.slice(0, match.index)}${keptDigits}`.trim();
  return productName ? { productName, quantity: roundedInferredQuantity } : null;
}

function splitAttachedQuantityByAmount(name, pricePerUnit, totalAmount) {
  if (!name || !Number.isFinite(pricePerUnit) || pricePerUnit <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    return null;
  }

  const match = name.match(/(\d{1,5})$/);
  if (!match) return null;

  const digits = match[1];
  const candidates = [];
  for (let length = 1; length <= digits.length; length += 1) {
    const quantityText = digits.slice(-length);
    const quantity = toNumber(quantityText);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const productDigits = digits.slice(0, -length);
    const difference = Math.abs((quantity * pricePerUnit) - totalAmount);
    candidates.push({ productDigits, quantity, difference });
  }

  const best = candidates
    .filter((candidate) => candidate.difference <= Math.max(1.25, pricePerUnit * 0.35))
    .sort((left, right) => left.difference - right.difference || right.quantity - left.quantity)[0];

  if (!best) return null;

  const productName = `${name.slice(0, match.index)}${best.productDigits}`.trim();
  return productName ? { productName, quantity: best.quantity } : null;
}

function hasLatin(value = "") {
  return /[A-Za-z]/.test(value);
}

function hasNativeScript(value = "") {
  return /[^\u0000-\u007F]/.test(value);
}

function isolateMultilingualName(rawName = "", inferredQuantity, pricePerUnit = null, totalAmount = null) {
  let working = cleanProductName(rawName);
  let quantity = null;

  const attachedQuantity = splitAttachedInferredQuantity(working, inferredQuantity);
  if (attachedQuantity) {
    working = attachedQuantity.productName;
    quantity = attachedQuantity.quantity;
  } else {
    const spacedQuantity = splitTrailingInferredQuantity(working, inferredQuantity);
    if (spacedQuantity) {
      working = spacedQuantity.productName;
      quantity = spacedQuantity.quantity;
    }
  }

  if (quantity === null) {
    const amountQuantity = splitAttachedQuantityByAmount(working, pricePerUnit, totalAmount);
    if (amountQuantity) {
      working = amountQuantity.productName;
      quantity = amountQuantity.quantity;
    }
  }

  const tokens = working.split(/\s+/).filter(Boolean);
  let itemCode = "";
  let bodyTokens = tokens;
  if (tokens.length > 1 && /^[A-Za-z][A-Za-z0-9/-]{0,7}$/.test(tokens[0]) && tokens.slice(1).some(hasNativeScript)) {
    itemCode = tokens[0];
    bodyTokens = tokens.slice(1);
  }
  const packPriceToken = bodyTokens.find((token, index) => (
    /^(\d{1,3})(?:\/-)?$/.test(token) &&
    (
      index === 0 ||
      hasNativeScript(bodyTokens[index - 1] || "") ||
      hasNativeScript(bodyTokens[index + 1] || "")
    )
  ));
  const packPrice = packPriceToken ? toNumber(packPriceToken.match(/\d{1,3}/)?.[0]) : null;

  let bestStart = -1;
  let bestEnd = -1;
  for (let index = 0; index < bodyTokens.length; index += 1) {
    if (!hasLatin(bodyTokens[index])) continue;

    let end = index + 1;
    while (end < bodyTokens.length && !hasNativeScript(bodyTokens[end])) {
      end += 1;
    }

    if (end - index >= bestEnd - bestStart) {
      bestStart = index;
      bestEnd = end;
    }
  }

  let englishTokens = bestStart >= 0 ? bodyTokens.slice(bestStart, bestEnd) : [];
  if (packPrice && englishTokens.length) {
    englishTokens = englishTokens.map((token) => {
      const escapedPackPrice = packPrice.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return token.replace(new RegExp(`${escapedPackPrice}$`), "");
    }).filter(Boolean);
  }
  if (
    englishTokens.length &&
    bodyTokens.some(hasNativeScript) &&
    englishTokens.every((token) => /^[\d.,/-]*(?:x|pic|pcs?|\u00d7)[\d.,/-]*(?:pic|pcs?)?$/i.test(token))
  ) {
    englishTokens = [];
  }
  const nativeTokens = bodyTokens.filter((token, index) => (
    hasNativeScript(token) ||
    (bestStart >= 0 && index < bestStart && !hasLatin(token))
  ));

  return {
    itemCode,
    nativeName: nativeTokens.join(" ").trim(),
    productName: (englishTokens.length ? englishTokens : bodyTokens).join(" ").trim(),
    packPrice,
    quantity
  };
}

function splitSerialPrefix(line, expectedSerial) {
  const exactSerial = line.match(/^(\d{1,3})$/);
  if (exactSerial) {
    return { serialNo: Number.parseInt(exactSerial[1], 10), rest: "" };
  }

  if (Number.isInteger(expectedSerial) && expectedSerial > 0) {
    const expectedText = expectedSerial.toString();
    const nextCharacter = line.charAt(expectedText.length);
    if (line.startsWith(expectedText) && line.length > expectedText.length && !/\s/.test(nextCharacter) && (!/\d/.test(nextCharacter) || expectedText.length > 1)) {
      return { serialNo: expectedSerial, rest: line.slice(expectedText.length).trim() };
    }

    const rest = line.slice(expectedText.length).trim();
    if (line.startsWith(expectedText) && /^(?:Rs|INR)\b/i.test(rest)) {
      return { serialNo: expectedSerial, rest };
    }
  }

  if (!Number.isInteger(expectedSerial)) {
    const firstCompact = line.match(/^1(?![\d\s])(.+)$/);
    if (firstCompact) {
      return { serialNo: 1, rest: firstCompact[1].trim() };
    }

    const firstCurrencyCompact = line.match(/^1\s+((?:Rs|INR)\b.+)$/i);
    if (firstCurrencyCompact) {
      return { serialNo: 1, rest: firstCurrencyCompact[1].trim() };
    }
  }

  return null;
}

function restoreDisplayCurrency(value = "") {
  return value
    .toString()
    .replace(/\bRs\s*/gi, "₹")
    .replace(/(\d)\s*x\s*(\d)/gi, "$1×$2")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidBarcode(value = "") {
  return /^\d{6,14}$/.test(value.toString().trim());
}

function makeStrictItem({
  serialNo,
  itemName = "",
  barcode = "",
  quantity = 0,
  pricePerUnit = 0,
  totalAmount = 0,
  invoiceLine = ""
}) {
  const cleanName = restoreDisplayCurrency(itemName);
  const cleanBarcode = isValidBarcode(barcode) ? barcode.toString().trim() : "";
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const safePrice = Number.isFinite(pricePerUnit) && pricePerUnit > 0 ? pricePerUnit : 0;
  const safeTotal = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0;
  const cleanInvoiceLine = restoreDisplayCurrency(invoiceLine);
  const fallbackInvoiceLine = [
    cleanName,
    safeQuantity > 0 ? safeQuantity : "",
    safePrice > 0 ? safePrice : "",
    safeTotal > 0 ? safeTotal : ""
  ].filter((part) => part !== "").join(" ");

  return {
    itemName: cleanName,
    itemCode: cleanBarcode,
    productName: cleanName,
    hsnOrBarcode: cleanBarcode,
    quantity: safeQuantity,
    unitPrice: safePrice,
    amount: safeTotal,
    pricePerUnit: safePrice,
    totalAmount: safeTotal,
    invoiceLine: cleanInvoiceLine || fallbackInvoiceLine,
    serialNo
  };
}

function parseStrictAmountDetail(line = "") {
  const currencyMatches = [...line.matchAll(/(?:₹|Rs|INR)\s*([\d,]+(?:\.\d+)?)/gi)];
  if (currencyMatches.length < 2) return null;

  const priceMatch = currencyMatches.at(-2);
  const amountMatch = currencyMatches.at(-1);
  const pricePerUnit = toNumber(priceMatch[1]);
  const totalAmount = toNumber(amountMatch[1]);
  if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const beforePrice = line.slice(0, priceMatch.index).trim();
  const chooseQuantitySplit = (digits) => {
    const candidates = [];
    for (let length = 1; length <= digits.length; length += 1) {
      const quantityText = digits.slice(-length);
      const quantity = toNumber(quantityText);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      candidates.push({
        prefixDigits: digits.slice(0, -length),
        quantity,
        difference: Math.abs((quantity * pricePerUnit) - totalAmount)
      });
    }

    return candidates
      .filter((candidate) => candidate.difference <= Math.max(1.25, pricePerUnit * 0.35))
      .sort((left, right) => left.difference - right.difference || right.quantity - left.quantity)[0] || null;
  };

  const compactPackBarcodeQuantity = beforePrice.match(/(?:₹|Rs|INR)\s*(\d{2,21})$/i);
  if (compactPackBarcodeQuantity) {
    const compactDigits = compactPackBarcodeQuantity[1];
    const candidates = [];
    for (let packLength = 1; packLength <= Math.min(3, compactDigits.length - 6); packLength += 1) {
      const packPrice = compactDigits.slice(0, packLength);
      const packPriceValue = toNumber(packPrice);
      if (!Number.isFinite(packPriceValue) || packPriceValue <= 0 || packPriceValue > 100) continue;

      const barcodeQuantity = compactDigits.slice(packLength);
      const split = chooseQuantitySplit(barcodeQuantity);
      if (split?.prefixDigits && isValidBarcode(split.prefixDigits)) {
        candidates.push({ packPrice, barcode: split.prefixDigits, quantity: split.quantity });
      }
    }

    const selected = candidates.sort((left, right) => {
      const leftLeadingZero = left.barcode.startsWith("0") ? 1 : 0;
      const rightLeadingZero = right.barcode.startsWith("0") ? 1 : 0;
      return leftLeadingZero - rightLeadingZero || right.barcode.length - left.barcode.length || right.packPrice.length - left.packPrice.length;
    })[0];

    if (selected) {
      return {
        barcode: selected.barcode,
        quantity: selected.quantity,
        pricePerUnit,
        totalAmount,
        codeColumnText: `${beforePrice.slice(0, compactPackBarcodeQuantity.index)}₹${selected.packPrice}`.trim()
      };
    }
  }

  const barcodeQuantityMatch = beforePrice.match(/(\d{6,18})$/);
  if (barcodeQuantityMatch) {
    const split = chooseQuantitySplit(barcodeQuantityMatch[1]);
    const barcode = split?.prefixDigits || "";
    const quantity = split?.quantity || 0;
    return {
      barcode: isValidBarcode(barcode) ? barcode : "",
      quantity,
      pricePerUnit,
      totalAmount,
      codeColumnText: beforePrice.slice(0, barcodeQuantityMatch.index).trim()
    };
  }

  const trailingDecimalQuantityMatch = beforePrice.match(/(\d+\.\d+)$/);
  if (trailingDecimalQuantityMatch) {
    return {
      barcode: "",
      quantity: toNumber(trailingDecimalQuantityMatch[1]),
      pricePerUnit,
      totalAmount,
      codeColumnText: beforePrice.slice(0, trailingDecimalQuantityMatch.index).trim()
    };
  }

  const compactCurrencyQuantity = beforePrice.match(/(?:₹|Rs|INR)\s*(\d{2,8})$/i);
  if (compactCurrencyQuantity) {
    const split = chooseQuantitySplit(compactCurrencyQuantity[1]);
    return {
      barcode: "",
      quantity: split?.quantity || 0,
      pricePerUnit,
      totalAmount,
      codeColumnText: beforePrice.slice(0, compactCurrencyQuantity.index).trim()
    };
  }

  const trailingQuantityMatch = beforePrice.match(/(\d{1,5})$/);
  if (trailingQuantityMatch) {
    const split = chooseQuantitySplit(trailingQuantityMatch[1]);
    const quantity = split?.quantity || toNumber(trailingQuantityMatch[1]);
    const prefixDigits = split?.prefixDigits ?? "";
    return {
      barcode: "",
      quantity,
      pricePerUnit,
      totalAmount,
      codeColumnText: `${beforePrice.slice(0, trailingQuantityMatch.index)}${prefixDigits}`.trim()
    };
  }

  return {
    barcode: "",
    quantity: 0,
    pricePerUnit,
    totalAmount,
    codeColumnText: beforePrice
  };
}

function getStrictAmountDetail(line = "", cache) {
  if (!cache) return parseStrictAmountDetail(line);
  if (cache.has(line)) return cache.get(line);

  const detail = parseStrictAmountDetail(line);
  cache.set(line, detail);
  return detail;
}

function isLikelyItemNameContinuation(line = "") {
  const restored = restoreDisplayCurrency(line);
  return !hasLatin(restored) || /(?:₹|Rs)\s*\d+\s*[x×]\s*\d+/i.test(restored) || /\d+\s*[x×]\s*\d+\s*(?:pic|pcs?)?$/i.test(restored);
}

function pickStrictItemNameParts(parts, detailIndex) {
  const beforeDetail = parts.slice(0, detailIndex);
  if (!beforeDetail.length) return [];
  if (beforeDetail.length === 1) return beforeDetail;
  if (hasLatin(beforeDetail[0])) return beforeDetail;

  const itemNameParts = [];
  for (const part of beforeDetail) {
    if (!itemNameParts.length || isLikelyItemNameContinuation(part)) {
      itemNameParts.push(part);
      continue;
    }
    break;
  }

  return itemNameParts;
}

function parseStrictRowGroup(group, detailCache) {
  const parts = group.parts || [];
  const detailIndex = parts.findIndex((part) => getStrictAmountDetail(part, detailCache));
  if (detailIndex < 0) {
    return makeStrictItem({
      serialNo: group.serialNo,
      itemName: parts[0] || ""
    });
  }

  const detail = getStrictAmountDetail(parts[detailIndex], detailCache);
  const itemNameParts = pickStrictItemNameParts(parts, detailIndex);
  const itemName = itemNameParts.length
    ? itemNameParts.join(" ")
    : restoreDisplayCurrency(detail.codeColumnText);

  return makeStrictItem({
    serialNo: group.serialNo,
    itemName,
    barcode: detail.barcode,
    quantity: detail.quantity,
    pricePerUnit: detail.pricePerUnit,
    totalAmount: detail.totalAmount,
    invoiceLine: `${itemName} ${detail.barcode} ${detail.quantity} ${detail.pricePerUnit} ${detail.totalAmount}`.trim()
  });
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
  let quantity = Number.isFinite(amounts.explicitQuantity) && amounts.explicitQuantity > 0
    ? amounts.explicitQuantity
    : Number.isFinite(explicitPackQuantity) && explicitPackQuantity > 0 ? explicitPackQuantity : null;
  let productName = amounts.beforeAmounts;
  let nativeName = "";

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
  } else if (quantity === null) {
    const splitQuantity = splitTrailingInferredQuantity(productName, inferredQuantity);
    if (splitQuantity) {
      productName = splitQuantity.productName;
      quantity = splitQuantity.quantity;
    }
  }

  const multilingualName = isolateMultilingualName(productName, inferredQuantity, amounts.pricePerUnit, amounts.totalAmount);
  productName = multilingualName.productName;
  nativeName = multilingualName.nativeName;
  quantity = quantity ?? multilingualName.quantity;
  hsnOrBarcode = hsnOrBarcode || multilingualName.itemCode;
  const packPrice = hsnOrBarcode ? null : multilingualName.packPrice;

  const item = buildItem(
    productName,
    hsnOrBarcode,
    quantity,
    amounts.pricePerUnit,
    amounts.totalAmount,
    row,
    { packPrice }
  );
  if (item && nativeName) item.nativeName = nativeName;
  return item;
}

function parseSeparatedVyaparRows(lines) {
  const section = getItemSectionLines(lines);
  const rows = [];
  const rowGroups = [];
  const detailCache = new Map();
  let current = null;
  let expectedSerial = null;

  for (const line of section) {
    if (/^invoice$/i.test(line) || isItemTableHeaderLine(line)) continue;

    const lineDetail = getStrictAmountDetail(line, detailCache);
    if (current && !current.hasDetail && lineDetail) {
      current.parts.push(line);
      current.hasDetail = true;
      continue;
    }

    const serialPrefix = splitSerialPrefix(line, expectedSerial);
    if (serialPrefix) {
      if (current) rowGroups.push(current);
      current = { serialNo: serialPrefix.serialNo, parts: [], hasDetail: false };
      expectedSerial = serialPrefix.serialNo + 1;
      if (serialPrefix.rest) {
        current.parts.push(serialPrefix.rest);
        current.hasDetail = Boolean(getStrictAmountDetail(serialPrefix.rest, detailCache));
      }
      continue;
    }

    if (current) current.parts.push(line);
  }

  if (current) rowGroups.push(current);

  for (const group of rowGroups) {
    try {
      rows.push(parseStrictRowGroup(group, detailCache));
    } catch (error) {
      console.warn("Malformed strict invoice row preserved with fallbacks:", {
        serialNo: group?.serialNo,
        parts: group?.parts,
        message: error?.message
      });
      rows.push(makeStrictItem({ serialNo: group?.serialNo }));
    }
  }

  return rows;
}

function extractVyaparItems(lines) {
  const separatedRows = parseSeparatedVyaparRows(lines);
  if (separatedRows.length) return separatedRows;

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
  return (items || []).filter(Boolean);
}

export function extractItems(lines) {
  const candidates = [...extractVyaparItems(lines)];
  if (candidates.length) return candidates;

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

    const lines = cleanLines(parsed?.text);
    if (lines.length < 5) {
      throw Object.assign(new Error("PDF has no readable invoice text. Please upload the original Vyapar PDF, not a photo or scanned PDF."), { statusCode: 422 });
    }

    const items = extractItems(lines).map((item, index) => ({
      ...item,
      serialNo: item.serialNo || index + 1
    }));

    if (!items.length) {
      throw Object.assign(new Error("No invoice items found. Please check the Vyapar PDF format."), { statusCode: 422 });
    }

    const summary = extractSummaryFields(lines);
    const totals = calculateInvoiceTotals(items, summary);
    const parserDiagnostics = buildParserDiagnostics(items);

    return {
      invoiceNo: extractInvoiceNo(lines),
      date: extractDate(lines),
      customerName: extractCustomerName(lines),
      contact: extractContact(lines),
      tableColumns: [...VYAPAR_TABLE_COLUMNS],
      items,
      itemsTotal: totals.itemsTotal,
      subtotal: totals.totalBeforeRoundOff,
      totalBeforeRoundOff: totals.totalBeforeRoundOff,
      totalAfterRoundOff: totals.totalAfterRoundOff,
      total: totals.total,
      totalMatchesAfterRoundOff: totals.totalMatchesAfterRoundOff,
      parserDiagnostics,
      roundOff: summary.roundOff,
      balance: summary.balance ?? 0,
      previousBalance: summary.previousBalance,
      currentBalance: summary.currentBalance,
      paymentType: summary.paymentType,
      paidAmount: summary.paidAmount
    };
  } catch (error) {
    console.error("Parser error:", error);
    const message = error.statusCode === 422 ? error.message : "Unsupported invoice format";
    throw Object.assign(new Error(message), { statusCode: 422, cause: error });
  }
}

export const pdfParserInternals = {
  parseVyaparRow,
  parseAmountTail,
  splitTrailingInferredQuantity,
  isolateMultilingualName,
  calculateInvoiceTotals,
  buildParserDiagnostics,
  normalizeTableHeaderLine,
  renderPageWithColumns
};
