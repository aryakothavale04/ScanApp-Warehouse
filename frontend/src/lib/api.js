import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is required to make API requests");
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || "Request failed";
    return Promise.reject(new Error(message));
  }
);

export async function request(path, method = "get", options = {}) {
  const config = {
    method,
    url: path,
    ...options
  };

  const response = await apiClient(config);
  return response.data;
}

export const api = {
  orders: () => request("/orders"),
  order: (id) => request(`/orders/${id}`),
  uploadInvoice: (file) => {
    const formData = new FormData();
    formData.append("invoice", file);
    return request("/orders/upload", "post", {
      data: formData,
      headers: { "Content-Type": "multipart/form-data" }
    });
  },
  scan: (orderId, barcode, scannedBy = "packing-staff") =>
    request(`/orders/${orderId}/scan`, "post", {
      data: { barcode, scannedBy }
    })
};
