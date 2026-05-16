"use client";

import { Boxes, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/src/lib/api";
import OrderCard from "./OrderCard";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";
import UploadInvoice from "./UploadInvoice";

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeDetail, setActiveDetail] = useState("orders");

  async function loadOrders() {
    setLoading(true);
    try {
      const data = await api.orders();
      setOrders(data.orders || []);
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  function removeOrder(orderId) {
    setOrders((currentOrders) => currentOrders.filter((order) => order._id !== orderId));
  }

  useEffect(() => {
    loadOrders();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const stats = useMemo(() => {
    const pendingOrders = orders.filter((order) => order.packedStatus !== "Packed");
    const pendingItems = pendingOrders.flatMap((order) =>
      (order.items || [])
        .map((item, itemIndex) => ({
          ...item,
          itemIndex,
          pendingQuantity: Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0),
          orderId: order._id,
          invoiceNo: order.invoiceNo,
          customerName: order.customerName
        }))
        .filter((item) => item.pendingQuantity > 0)
    );
    const pendingProductQuantity = pendingItems.reduce((sum, item) => sum + item.pendingQuantity, 0);
    const pendingProducts = pendingItems.reduce((groups, item) => {
      const key = item.productId?._id || item.productId || item.hsnOrBarcode || item.productName;
      const existing = groups.get(key) || {
        key,
        productName: item.productName,
        hsnOrBarcode: item.hsnOrBarcode,
        pendingQuantity: 0,
        orders: []
      };

      existing.pendingQuantity += item.pendingQuantity;
      existing.orders.push({
        orderId: item.orderId,
        itemIndex: item.itemIndex,
        invoiceNo: item.invoiceNo,
        customerName: item.customerName,
        pendingQuantity: item.pendingQuantity
      });
      groups.set(key, existing);
      return groups;
    }, new Map());

    return {
      pendingOrders,
      pendingOrderCount: pendingOrders.length,
      pendingItems,
      pendingProductQuantity,
      pendingProducts: Array.from(pendingProducts.values()).sort((first, second) =>
        first.productName.localeCompare(second.productName)
      )
    };
  }, [orders]);

  const cards = [
    {
      id: "orders",
      label: "Pending Orders",
      value: stats.pendingOrderCount,
      icon: TimerReset,
      color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"
    },
    {
      id: "products",
      label: "Pending Products",
      value: stats.pendingProductQuantity,
      icon: Boxes,
      color: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-100"
    }
  ];

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-3">
          <StoreBrand />
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const selected = activeDetail === card.id;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => setActiveDetail(card.id)}
                className={`rounded-lg bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:bg-[#151f1a] ${
                  selected ? "ring-2 ring-leaf" : ""
                }`}
              >
                <div className={`mb-3 grid h-10 w-10 place-items-center rounded-lg ${card.color}`}>
                  <Icon size={20} />
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">{card.label}</p>
                <p className="text-2xl font-black">{card.value}</p>
              </button>
            );
          })}
        </div>

        <section className="mb-5 rounded-lg bg-white p-4 shadow-sm dark:bg-[#151f1a]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {activeDetail === "orders" ? "Pending Order Details" : "Pending Product Details"}
            </h2>
            <span className="rounded-full bg-limewash px-3 py-1 text-xs font-semibold text-black/60 dark:bg-white/10 dark:text-white/60">
              {stats.pendingItems.length} pending lines
            </span>
          </div>

          {activeDetail === "orders" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {stats.pendingOrders.map((order) => {
                const pendingItems = (order.items || [])
                  .map((item, itemIndex) => ({
                    ...item,
                    itemIndex,
                    pendingQuantity: Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0)
                  }))
                  .filter((item) => item.pendingQuantity > 0);

                return (
                  <div key={order._id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                    <p className="text-sm font-bold">{order.invoiceNo}</p>
                    <p className="mb-3 text-xs text-black/55 dark:text-white/55">{order.customerName}</p>
                    <div className="space-y-2">
                      {pendingItems.map((item) => (
                        <div key={`${order._id}-${item.itemIndex}-${item.productId?._id || item.productId || item.hsnOrBarcode || item.productName}`} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">{item.productName}</span>
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                            {item.pendingQuantity} pending
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!stats.pendingOrders.length && (
                <div className="rounded-lg bg-limewash p-4 text-center text-sm text-black/55 dark:bg-white/5 dark:text-white/55">
                  No pending orders.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {stats.pendingProducts.map((product) => (
                <div key={product.key} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{product.productName}</p>
                      {product.hsnOrBarcode && <p className="text-xs text-black/45 dark:text-white/45">{product.hsnOrBarcode}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-100">
                      {product.pendingQuantity} pending
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {product.orders.map((order) => (
                      <div key={`${product.key}-${order.orderId}-${order.itemIndex}`} className="rounded-lg bg-limewash p-2 text-xs dark:bg-white/5">
                        <p className="font-semibold">{order.invoiceNo}</p>
                        <p className="truncate text-black/55 dark:text-white/55">{order.customerName}</p>
                        <p className="mt-1 font-bold">{order.pendingQuantity} pending</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!stats.pendingProducts.length && (
                <div className="rounded-lg bg-limewash p-4 text-center text-sm text-black/55 dark:bg-white/5 dark:text-white/55">
                  No pending products.
                </div>
              )}
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <UploadInvoice onUploaded={loadOrders} onToast={setToast} />
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Pending Orders</h2>
              <button onClick={loadOrders} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-semibold dark:border-white/10">
                Refresh
              </button>
            </div>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-56 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.pendingOrders.map((order) => (
                  <OrderCard key={order._id} order={order} onDeleted={removeOrder} onToast={setToast} />
                ))}
                {!stats.pendingOrders.length && (
                  <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 dark:bg-[#151f1a] dark:text-white/55">
                    No pending orders.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
