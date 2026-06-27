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

export function openOrderSlip(order, slipType = "packing") {
  if (typeof window === "undefined" || !order) return;

  const title = slipType === "delivery" ? "Delivery Slip" : "Packing Slip";
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

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
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
          .location { font-weight: 700; }
          @media print {
            body { margin: 12mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
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
