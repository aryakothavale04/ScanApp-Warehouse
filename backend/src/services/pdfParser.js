import pdfParse from "pdf-parse/lib/pdf-parse.js";

function cleanLines(text) {
  return text
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
  const barcode = hsnOrBarcode?.trim();
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

function buildItem(productName, hsnOrBarcode, quantity, pricePerUnit, totalAmount, invoiceLine) {
  const hasExplicitQuantity = quantity !== null && quantity !== undefined;
  const calculatedQuantity = quantity || (pricePerUnit > 0 ? totalAmount / pricePerUnit : 0);
  const barcode = splitCompactBarcodeQuantity(hsnOrBarcode, calculatedQuantity, hasExplicitQuantity);

  return {
    productName: productName.trim(),
    hsnOrBarcode: barcode,
    quantity: Number(calculatedQuantity.toFixed(3)),
    pricePerUnit,
    totalAmount,
    invoiceLine
  };
}

function extractItems(lines) {
  const itemLines = [];
  const detailPattern = /^([A-Z0-9\-/]+)\s*(?:(\d+(?:\.\d+)?)\s+)?₹\s*([\d,]+(?:\.\d+)?)\s*₹\s*([\d,]+(?:\.\d+)?)/i;
  const combinedPattern = /^(\d+)\s*(.+?)\s+([A-Z0-9\-/]+)\s*(?:(\d+(?:\.\d+)?)\s+)?₹\s*([\d,]+(?:\.\d+)?)\s*₹\s*([\d,]+(?:\.\d+)?)/i;
  const stopPattern = /invoice amount in words|payment type|amounts|sub total|round off|total|balance|bank details/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPattern.test(line)) break;

    const combined = line.match(combinedPattern);
    if (combined && !/^#/.test(line)) {
      itemLines.push(buildItem(
        combined[2],
        combined[3],
        combined[4] ? toNumber(combined[4]) : null,
        toNumber(combined[5]),
        toNumber(combined[6]),
        line
      ));
      continue;
    }

    if (!/^\d+$/.test(line)) continue;

    const nameParts = [];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const nextLine = lines[cursor];
      if (stopPattern.test(nextLine) || /^invoice$/i.test(nextLine) || /^#item name/i.test(nextLine)) {
        break;
      }

      const detail = nextLine.match(detailPattern);
      if (detail) {
        const productName = nameParts.join(" ").trim();
        const hsnOrBarcode = detail[1];
        const quantity = detail[2] ? toNumber(detail[2]) : null;
        const pricePerUnit = toNumber(detail[3]);
        const totalAmount = toNumber(detail[4]);

        if (productName && pricePerUnit > 0 && totalAmount > 0) {
          itemLines.push(buildItem(productName, hsnOrBarcode, quantity, pricePerUnit, totalAmount, `${productName} ${nextLine}`));
        }

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
  const parsed = await pdfParse(buffer);
  const lines = cleanLines(parsed.text);
  const items = extractItems(lines);

  if (!items.length) {
    throw Object.assign(new Error("No invoice items found. Please check the Vyapar PDF format."), { statusCode: 422 });
  }

  return {
    invoiceNo: extractInvoiceNo(lines),
    customerName: extractCustomerName(lines),
    items,
    rawText: parsed.text
  };
}
