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

  const customerLine = lines.find((line) => /customer|party|ग्राहक|ग्राहकाचे नाव/i.test(line));
  const match = customerLine?.match(/(?:customer|party|ग्राहक|ग्राहकाचे नाव)\s*[:\-]?\s*(.+)$/i);
  return match?.[1]?.trim() || "Walk-in Customer";
}

function extractItems(lines) {
  const itemLines = [];
  const detailPattern = /^(\d+(?:\.\d+)?)₹\s*([\d.]+)₹\s*([\d.]+)/;
  const combinedPattern = /^(\d+)\s*(.+?)\s*(\d+(?:\.\d+)?)₹\s*([\d.]+)₹\s*([\d.]+)/;
  const stopPattern = /invoice amount in words|payment type|amounts|sub total|round off|total|balance|bank details/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPattern.test(line)) break;

    const combined = line.match(combinedPattern);
    if (combined && !/^#/.test(line)) {
      itemLines.push({
        productName: combined[2].trim(),
        quantity: Number.parseFloat(combined[3]),
        invoiceLine: line
      });
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
        const quantity = Number.parseFloat(detail[1]);
        if (productName && quantity > 0) {
          itemLines.push({
            productName,
            quantity,
            invoiceLine: `${productName} ${nextLine}`
          });
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
    const key = item.productName.toLowerCase();
    const previous = merged.get(key);
    if (previous) {
      previous.quantity += item.quantity;
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
