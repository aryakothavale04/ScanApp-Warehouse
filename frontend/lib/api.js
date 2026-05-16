const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers
    },
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export const api = {
  orders: () => request("/orders"),
  order: (id) => request(`/orders/${id}`),
  uploadInvoice: (file) => {
    const formData = new FormData();
    formData.append("invoice", file);
    return request("/orders/upload", { method: "POST", body: formData });
  },
  scan: (orderId, barcode, scannedBy = "packing-staff") =>
    request(`/orders/${orderId}/scan`, {
      method: "POST",
      body: JSON.stringify({ barcode, scannedBy })
    })
};
