function escapeHtml(value = "") {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatPackingLocations(item = {}) {
  const locations = (item.packingLocations || []).filter((entry) => (entry.quantity || 0) > 0);
  if (!locations.length) return item.packedQuantity > 0 ? "Not set" : "-";
  return locations.map((entry) => `${entry.label || "Location"} (${entry.quantity})`).join(", ");
}

export function getDeliveryChallanSummary(order = {}) {
  const locationById = new Map((order.packingLocations || []).map((location) => [String(location._id), location]));
  const containers = new Map();
  const looseItems = new Map();

  (order.items || []).forEach((item) => {
    (item.packingLocations || []).forEach((entry) => {
      const quantity = Number(entry.quantity || 0);
      if (quantity <= 0) return;

      const location = locationById.get(String(entry.locationId));
      const label = entry.label || location?.label || "Location";
      if (location?.type === "Loose Items" || label.toLowerCase() === "loose items") {
        const itemLabel = item.itemName || item.productName || item.nativeName || "Product";
        looseItems.set(itemLabel, {
          label: itemLabel,
          quantity: (looseItems.get(itemLabel)?.quantity || 0) + quantity
        });
        return;
      }

      containers.set(label, {
        label,
        quantity: (containers.get(label)?.quantity || 0) + quantity
      });
    });
  });

  return {
    customerName: order.customerName || "-",
    deliveryAddress: order.deliveryAddress || order.address || order.shippingAddress || "-",
    contact: order.contact || order.contactNumber || order.phone || "-",
    orderNumber: order.invoiceNo || order.orderNumber || "-",
    date: order.date || "-",
    containers: [...containers.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true })),
    looseItems: [...looseItems.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))
  };
}

function buildSlipSection(order, title) {
  const rows = (order.items || []).map((item, index) => `
    <tr>
      <td>${item.serialNo || index + 1}</td>
      <td>${escapeHtml(item.productName || item.itemName || "Product")}</td>
      <td>${escapeHtml(item.hsnOrBarcode || item.productId?.barcode || "-")}</td>
      <td>${item.quantity || 0}</td>
      <td>${item.packedQuantity || 0}</td>
      <td>${escapeHtml(formatPackingLocations(item))}</td>
    </tr>
  `).join("");

  return `
    <section class="slip">
      <header>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          <p><strong>Invoice:</strong> ${escapeHtml(order.invoiceNo || "-")}</p>
          <p><strong>Date:</strong> ${escapeHtml(order.date || "-")}</p>
          <p><strong>Party:</strong> ${escapeHtml(order.customerName || "-")}</p>
          <p><strong>Status:</strong> ${escapeHtml(order.packedStatus || "-")}</p>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Item</th>
            <th>Barcode</th>
            <th>Qty</th>
            <th>Packed</th>
            <th>Packing Location</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

export function openOrderSlip(order, slipType = "packing") {
  if (typeof window === "undefined" || !order) return;

  const title = slipType === "both" ? "Packing Slip & Delivery Challan" : slipType === "delivery" ? "Delivery Challan" : "Packing Slip";
  const sections = slipType === "both"
    ? `${buildSlipSection(order, "Packing Slip")}${buildDeliveryChallanSection(order)}`
    : slipType === "delivery" ? buildDeliveryChallanSection(order) : buildSlipSection(order, title);
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)} - ${escapeHtml(order.invoiceNo || "")}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #111; font-family: Arial, sans-serif; margin: 24px; }
          header { border-bottom: 2px solid #111; margin-bottom: 16px; padding-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 8px; }
          p { margin: 3px 0; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #bbb; font-size: 12px; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #f1f5f1; font-size: 11px; text-transform: uppercase; }
          .meta { display: grid; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .slip + .slip { break-before: page; margin-top: 32px; page-break-before: always; }
          @media print {
            body { margin: 12mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        ${sections}
        <script>
          window.onload = () => {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function buildDeliveryChallanSection(order) {
  const summary = getDeliveryChallanSummary(order);
  const containerRows = summary.containers.length
    ? summary.containers.map((container, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(container.label)}</td>
        <td>${escapeHtml(container.quantity)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="3">No delivery containers assigned.</td></tr>`;
  const looseRows = summary.looseItems.length
    ? summary.looseItems.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.label)}</td>
        <td>${escapeHtml(item.quantity)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="3">No loose items assigned.</td></tr>`;

  return `
    <section class="challan">
      <header>
        <h1>Delivery Challan</h1>
        <div class="meta">
          <p><strong>Customer Name:</strong> ${escapeHtml(summary.customerName)}</p>
          <p><strong>Order Number:</strong> ${escapeHtml(summary.orderNumber)}</p>
          <p><strong>Delivery Address:</strong> ${escapeHtml(summary.deliveryAddress)}</p>
          <p><strong>Date:</strong> ${escapeHtml(summary.date)}</p>
          <p><strong>Contact Number:</strong> ${escapeHtml(summary.contact)}</p>
        </div>
      </header>
      <h2>Delivery Containers</h2>
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Container</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>${containerRows}</tbody>
      </table>
      <h2>Loose Items</h2>
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Type</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>${looseRows}</tbody>
      </table>
    </section>
  `;
}

export function openDeliveryChallanPrint(order) {
  if (typeof window === "undefined" || !order) return;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Delivery Challan - ${escapeHtml(order.invoiceNo || "")}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #111; font-family: Arial, sans-serif; margin: 24px; }
          header { border-bottom: 2px solid #111; margin-bottom: 16px; padding-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 10px; }
          h2 { font-size: 15px; margin: 18px 0 8px; }
          p { margin: 3px 0; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #bbb; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f1f5f1; font-size: 11px; text-transform: uppercase; }
          .meta { display: grid; gap: 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .meta p:nth-child(3) { grid-column: 1 / -1; }
          @media print {
            body { margin: 12mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        ${buildDeliveryChallanSection(order)}
        <script>
          window.onload = () => {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function safeFilename(value = "") {
  return value.toString().trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "order";
}

function wrapText(context, text, maxWidth) {
  const words = text.toString().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width <= maxWidth) {
      line = nextLine;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawText(context, text, x, y, maxWidth, lineHeight = 15) {
  const lines = wrapText(context, text, maxWidth);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return lines.length * lineHeight;
}

function createSlipPages(order, titles) {
  const scale = 2;
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 34;
  const tableWidth = pageWidth - margin * 2;
  const columns = [
    { title: "No", x: margin, width: 34 },
    { title: "Item", x: margin + 34, width: 190 },
    { title: "Barcode", x: margin + 224, width: 100 },
    { title: "Qty", x: margin + 324, width: 46 },
    { title: "Packed", x: margin + 370, width: 58 },
    { title: "Packing Location", x: margin + 428, width: tableWidth - 428 }
  ];
  const pages = [];
  let canvas;
  let context;
  let y = margin;
  let currentTitle = "";

  function newPage(title) {
    canvas = document.createElement("canvas");
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = "#111111";
    context.textBaseline = "top";
    pages.push(canvas);
    y = margin;
    currentTitle = title;

    context.font = "700 24px Arial";
    context.fillText(title, margin, y);
    y += 34;
    context.font = "700 11px Arial";
    context.fillText(`Invoice: ${order.invoiceNo || "-"}`, margin, y);
    context.fillText(`Party: ${order.customerName || "-"}`, margin + 245, y);
    y += 17;
    context.fillText(`Date: ${order.date || "-"}`, margin, y);
    context.fillText(`Status: ${order.packedStatus || "-"}`, margin + 245, y);
    y += 26;
    drawTableHeader();
  }

  function drawTableHeader() {
    context.fillStyle = "#eef5ee";
    context.fillRect(margin, y, tableWidth, 24);
    context.strokeStyle = "#999999";
    context.strokeRect(margin, y, tableWidth, 24);
    context.fillStyle = "#111111";
    context.font = "700 10px Arial";
    columns.forEach((column) => {
      context.fillText(column.title, column.x + 4, y + 7);
      context.beginPath();
      context.moveTo(column.x, y);
      context.lineTo(column.x, y + 24);
      context.stroke();
    });
    y += 24;
  }

  function drawRow(cells) {
    context.font = "400 11px Arial";
    const lineHeights = cells.map((cell, index) => wrapText(context, cell, columns[index].width - 8).length * 14);
    const rowHeight = Math.max(30, ...lineHeights.map((height) => height + 12));

    if (y + rowHeight > pageHeight - margin) {
      newPage(currentTitle);
    }

    context.strokeStyle = "#bbbbbb";
    context.strokeRect(margin, y, tableWidth, rowHeight);
    columns.forEach((column, index) => {
      context.beginPath();
      context.moveTo(column.x, y);
      context.lineTo(column.x, y + rowHeight);
      context.stroke();
      context.fillStyle = "#111111";
      drawText(context, cells[index], column.x + 4, y + 7, column.width - 8, 14);
    });
    y += rowHeight;
  }

  titles.forEach((title) => {
    newPage(title);
    (order.items || []).forEach((item, index) => {
      drawRow([
        item.serialNo || index + 1,
        item.productName || item.itemName || "Product",
        item.hsnOrBarcode || item.productId?.barcode || "-",
        item.quantity || 0,
        item.packedQuantity || 0,
        formatPackingLocations(item)
      ]);
    });
  });

  return pages;
}

function createDeliveryChallanPages(orders) {
  const orderList = Array.isArray(orders) ? orders : [orders];
  const scale = 2;
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 34;
  const tableWidth = pageWidth - margin * 2;
  const columns = [
    { title: "No", x: margin, width: 42 },
    { title: "Name", x: margin + 42, width: tableWidth - 112 },
    { title: "Qty", x: margin + tableWidth - 70, width: 70 }
  ];
  const pages = [];
  let canvas;
  let context;
  let y = margin;

  function newPage(order) {
    const summary = getDeliveryChallanSummary(order);
    canvas = document.createElement("canvas");
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = "#111111";
    context.textBaseline = "top";
    pages.push(canvas);
    y = margin;

    context.font = "700 24px Arial";
    context.fillText("Delivery Challan", margin, y);
    y += 36;
    context.font = "700 11px Arial";
    context.fillText(`Customer Name: ${summary.customerName}`, margin, y);
    context.fillText(`Order Number: ${summary.orderNumber}`, margin + 300, y);
    y += 17;
    context.fillText(`Contact Number: ${summary.contact}`, margin, y);
    context.fillText(`Date: ${summary.date}`, margin + 300, y);
    y += 17;
    drawText(context, `Delivery Address: ${summary.deliveryAddress}`, margin, y, tableWidth, 14);
    y += 34;
  }

  function drawSectionTitle(title, currentOrder) {
    if (y + 46 > pageHeight - margin) {
      newPage(currentOrder);
    }
    context.font = "700 14px Arial";
    context.fillText(title, margin, y);
    y += 22;
    drawTableHeader();
  }

  function drawTableHeader() {
    context.fillStyle = "#eef5ee";
    context.fillRect(margin, y, tableWidth, 24);
    context.strokeStyle = "#999999";
    context.strokeRect(margin, y, tableWidth, 24);
    context.fillStyle = "#111111";
    context.font = "700 10px Arial";
    columns.forEach((column) => {
      context.fillText(column.title, column.x + 4, y + 7);
      context.beginPath();
      context.moveTo(column.x, y);
      context.lineTo(column.x, y + 24);
      context.stroke();
    });
    y += 24;
  }

  function drawRow(cells, currentOrder) {
    context.font = "400 11px Arial";
    const lineHeights = cells.map((cell, index) => wrapText(context, cell, columns[index].width - 8).length * 14);
    const rowHeight = Math.max(30, ...lineHeights.map((height) => height + 12));

    if (y + rowHeight > pageHeight - margin) {
      newPage(currentOrder);
      drawTableHeader();
    }

    context.strokeStyle = "#bbbbbb";
    context.strokeRect(margin, y, tableWidth, rowHeight);
    columns.forEach((column, index) => {
      context.beginPath();
      context.moveTo(column.x, y);
      context.lineTo(column.x, y + rowHeight);
      context.stroke();
      context.fillStyle = "#111111";
      drawText(context, cells[index], column.x + 4, y + 7, column.width - 8, 14);
    });
    y += rowHeight;
  }

  orderList.forEach((order) => {
    const summary = getDeliveryChallanSummary(order);
    newPage(order);
    drawSectionTitle("Delivery Containers", order);
    const containers = summary.containers.length ? summary.containers : [{ label: "No delivery containers assigned.", quantity: "-" }];
    containers.forEach((container, index) => drawRow([index + 1, container.label, container.quantity], order));
    y += 18;
    drawSectionTitle("Loose Items", order);
    const looseItems = summary.looseItems.length ? summary.looseItems : [{ label: "No loose items assigned.", quantity: "-" }];
    looseItems.forEach((item, index) => drawRow([index + 1, item.label, item.quantity], order));
  });

  return pages;
}

function canvasToJpegBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Could not render slip PDF."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.92);
  });
}

function buildPdfFromImages(images) {
  const encoder = new TextEncoder();
  const pageWidth = 595;
  const pageHeight = 842;
  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const pagesId = addObject("");
  const pageIds = images.map((image, index) => {
    const imageId = addObject([
      `<< /Type /XObject /Subtype /Image /Width ${image.pixelWidth} /Height ${image.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      "\nendstream"
    ]);
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ`;
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const chunks = [];
  const offsets = [0];
  let byteLength = 0;

  function pushChunk(chunk) {
    chunks.push(chunk);
    byteLength += typeof chunk === "string" ? encoder.encode(chunk).length : chunk.length;
  }

  function pushObjectContent(object) {
    if (Array.isArray(object)) {
      object.forEach(pushChunk);
      return;
    }
    pushChunk(object);
  }

  pushChunk("%PDF-1.4\n");
  objects.forEach((object, index) => {
    offsets.push(byteLength);
    pushChunk(`${index + 1} 0 obj\n`);
    pushObjectContent(object);
    pushChunk("\nendobj\n");
  });

  const xrefOffset = byteLength;
  pushChunk(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => {
    pushChunk(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  pushChunk(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

export async function downloadOrderSlipPdf(order, slipType = "packing") {
  if (typeof document === "undefined" || !order) return;
  if (slipType === "delivery") {
    await downloadDeliveryChallanPdf(order);
    return;
  }

  const canvases = slipType === "both"
    ? [...createSlipPages(order, ["Packing Slip"]), ...createDeliveryChallanPages(order)]
    : createSlipPages(order, ["Packing Slip"]);
  const images = await Promise.all(canvases.map(async (canvas) => {
    const bytes = await canvasToJpegBytes(canvas);
    return {
      bytes,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height
    };
  }));
  const pdf = buildPdfFromImages(images);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  const suffix = slipType === "both" ? "packing-slip-delivery-challan" : slipType === "delivery" ? "delivery-challan" : `${slipType}-slip`;
  link.href = url;
  link.download = `${safeFilename(order.invoiceNo || order.customerName)}-${suffix}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createDeliveryChallanPdfBlob(orders) {
  if (typeof document === "undefined" || !orders) return null;

  const canvases = createDeliveryChallanPages(orders);
  const images = await Promise.all(canvases.map(async (canvas) => {
    const bytes = await canvasToJpegBytes(canvas);
    return {
      bytes,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height
    };
  }));
  return buildPdfFromImages(images);
}

export async function downloadDeliveryChallanPdf(orders) {
  const orderList = Array.isArray(orders) ? orders : [orders];
  const pdf = await createDeliveryChallanPdfBlob(orderList);
  if (!pdf) return;

  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  const suffix = orderList.length > 1 ? "all-delivery-challans" : `${safeFilename(orderList[0]?.invoiceNo || orderList[0]?.customerName)}-delivery-challan`;
  link.href = url;
  link.download = `${suffix}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function shareDeliveryChallanPdf(orders) {
  const orderList = Array.isArray(orders) ? orders : [orders];
  const pdf = await createDeliveryChallanPdfBlob(orderList);
  if (!pdf) return false;

  const filename = orderList.length > 1
    ? "all-delivery-challans.pdf"
    : `${safeFilename(orderList[0]?.invoiceNo || orderList[0]?.customerName)}-delivery-challan.pdf`;
  const file = new File([pdf], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: orderList.length > 1 ? "Delivery Challans" : "Delivery Challan",
      files: [file]
    });
    return true;
  }

  await downloadDeliveryChallanPdf(orderList);
  return false;
}
