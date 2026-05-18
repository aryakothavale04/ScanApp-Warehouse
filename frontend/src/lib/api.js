import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
export const ACCESS_CODE_STORAGE_KEY = "scanapp_access_code";

export function getStoredAccessCode() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY) || "";
}

export function setStoredAccessCode(code) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, code);
}

export function clearStoredAccessCode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
}

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json"
  }
});

apiClient.interceptors.request.use((config) => {
  const code = getStoredAccessCode();
  if (code) {
    config.headers = config.headers || {};
    config.headers["x-access-code"] = code;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || "Backend is unavailable. Please try again shortly.";
    if (error.response?.status === 401) {
      clearStoredAccessCode();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("scanapp-auth-required"));
      }
    }
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
  manuallyCompleteOrder: (orderId, scannedBy = "packing-staff") =>
    request(`/api/orders/${orderId}/manual-complete`, "post", {
      data: { scannedBy }
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
  manualPackFullOrderItem: (orderId, itemIndex, scannedBy = "packing-staff") =>
    request(`/api/orders/${orderId}/items/${itemIndex}/manual-pack-full`, "post", {
      data: { scannedBy }
    }),
  removeOnePackedOrderItem: (orderId, itemIndex) =>
    request(`/api/orders/${orderId}/items/${itemIndex}/remove-pack-one`, "post", {
      data: {}
    }),
  removePackedOrderItem: (orderId, itemIndex) =>
    request(`/api/orders/${orderId}/items/${itemIndex}/remove-pack`, "post", {
      data: {}
    })
};
