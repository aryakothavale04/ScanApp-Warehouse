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
  uploadInvoice: (file) => {
    const formData = new FormData();
    formData.append("invoice", file);
    return request("/api/orders/upload", "post", {
      data: formData,
      headers: { "Content-Type": "multipart/form-data" }
    });
  },
  scan: (orderId, barcode, scannedBy = "packing-staff") =>
    request(`/api/orders/${orderId}/scan`, "post", {
      data: { barcode, scannedBy }
    })
};
