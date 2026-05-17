import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json"
  }
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || "Backend is unavailable. Please try again shortly.";
    return Promise.reject(new Error(message));
  }
);

export async function request(path, method = "get", options = {}) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL is required to make API requests");
  }

  const config = {
    method,
    url: path,
    ...options
  };

  const response = await apiClient(config);
  return response.data;
}

export const api = {
  health: () => request("/api/health"),
  test: () => request("/api/test"),
  orders: () => request("/api/orders"),
  order: (id) => request(`/api/orders/${id}`),
  updateOrder: (id, order) =>
    request(`/api/orders/${id}`, "patch", {
      data: order
    }),
  deleteOrder: (id) => request(`/api/orders/${id}`, "delete"),
  uploadInvoice: (file) => {
    const formData = new FormData();
    formData.append("invoice", file);
    return request("/api/orders/upload", "post", {
      data: formData,
      timeout: 120000,
      headers: { "Content-Type": "multipart/form-data" }
    });
  },
  scan: (orderId, barcode, scannedBy = "packing-staff") =>
    request(`/api/orders/${orderId}/scan`, "post", {
      data: { barcode, scannedBy }
    }),
  updateOrderItem: (orderId, itemIndex, item) =>
    request(`/api/orders/${orderId}/items/${itemIndex}`, "patch", {
      data: item
    }),
  addOrderItem: (orderId, item) =>
    request(`/api/orders/${orderId}/items`, "post", {
      data: item
    }),
  manualPackOrderItem: (orderId, itemIndex, scannedBy = "packing-staff") =>
    request(`/api/orders/${orderId}/items/${itemIndex}/manual-pack`, "post", {
      data: { scannedBy }
    }),
  removePackedOrderItem: (orderId, itemIndex) =>
    request(`/api/orders/${orderId}/items/${itemIndex}/remove-pack`, "post", {
      data: {}
    })
};
