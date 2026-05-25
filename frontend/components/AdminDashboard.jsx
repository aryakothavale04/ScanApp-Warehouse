"use client";

import { Boxes, CheckCircle2, ListOrdered, Loader2, TimerReset, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, clearStoredAccessCode } from "@/src/lib/api";
import OrderCard from "./OrderCard";
import StoreBrand from "./StoreBrand";
import Toast from "./Toast";
import UploadInvoice from "./UploadInvoice";

function compareOrderSequence(left, right) {
  const leftSequence = Number.isFinite(left?.orderSequence) ? left.orderSequence : Number.MAX_SAFE_INTEGER;
  const rightSequence = Number.isFinite(right?.orderSequence) ? right.orderSequence : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  return new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime();
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [trashedOrders, setTrashedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sequenceMode, setSequenceMode] = useState(false);
  const [movingOrderId, setMovingOrderId] = useState(null);
  const [sequenceTarget, setSequenceTarget] = useState(null);
  const [sequenceGroup, setSequenceGroup] = useState("pending");
  const [sequenceDraft, setSequenceDraft] = useState("");
  const [sequenceSaving, setSequenceSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [toast, setToast] = useState(null);

  async function loadOrders() {
    setLoading(true);
    try {
      const [ordersData, trashData] = await Promise.all([api.orders(), api.trashedOrders()]);
      setOrders(ordersData.orders || []);
      setTrashedOrders(trashData.orders || []);
    } catch (error) {
      setToast({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrder(orderToDelete) {
    try {
      await api.deleteOrder(orderToDelete._id);
      setOrders((currentOrders) => currentOrders.filter((order) => order._id !== orderToDelete._id));
      setTrashedOrders((currentTrash) => [{ ...orderToDelete, trashedAt: new Date().toISOString() }, ...currentTrash]);
      setToast({ type: "success", message: "Order moved to trash" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
      throw error;
    }
  }

  function logout() {
    clearStoredAccessCode();
    window.dispatchEvent(new Event("scanapp-auth-required"));
  }

  async function moveOrder(orderToMove, direction) {
    const groupCompleted = orderToMove.packedStatus === "Completed" || orderToMove.packedStatus === "Packed";
    const groupOrderIds = orders
      .filter((order) => (order.packedStatus === "Completed" || order.packedStatus === "Packed") === groupCompleted)
      .map((order) => order._id);
    const currentGroupIndex = groupOrderIds.indexOf(orderToMove._id);
    const nextGroupIndex = direction === "up" ? currentGroupIndex - 1 : currentGroupIndex + 1;

    if (currentGroupIndex < 0 || nextGroupIndex < 0 || nextGroupIndex >= groupOrderIds.length) return;

    const nextOrders = [...orders];
    const currentIndex = nextOrders.findIndex((order) => order._id === groupOrderIds[currentGroupIndex]);
    const nextIndex = nextOrders.findIndex((order) => order._id === groupOrderIds[nextGroupIndex]);
    if (currentIndex < 0 || nextIndex < 0) return;

    [nextOrders[currentIndex], nextOrders[nextIndex]] = [nextOrders[nextIndex], nextOrders[currentIndex]];
    setOrders(nextOrders);
    setMovingOrderId(orderToMove._id);

    try {
      const data = await api.updateOrderSequence(nextOrders.map((order) => order._id));
      setOrders(data.orders || nextOrders);
      setToast({ type: "success", message: "Order sequence updated" });
    } catch (error) {
      setToast({ type: "error", message: error.message });
      loadOrders();
    } finally {
      setMovingOrderId(null);
    }
  }

  async function moveOrderToSequence(orderToMove, targetSequence, groupOrders = stats.pendingOrders) {
    const targetIndex = Number.parseInt(targetSequence, 10) - 1;
    const currentGroupIndex = groupOrders.findIndex((order) => order._id === orderToMove._id);

    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= groupOrders.length) {
      setToast({ type: "error", message: `Enter a sequence number between 1 and ${groupOrders.length}` });
      return false;
    }

    if (currentGroupIndex < 0) return false;
    if (currentGroupIndex === targetIndex) return true;

    const reorderedGroupIds = groupOrders.map((order) => order._id);
    const [movedId] = reorderedGroupIds.splice(currentGroupIndex, 1);
    reorderedGroupIds.splice(targetIndex, 0, movedId);

    const groupIdSet = new Set(reorderedGroupIds);
    let nextGroupIndex = 0;
    const nextOrders = orders.map((order) => {
      if (!groupIdSet.has(order._id)) return order;
      const nextId = reorderedGroupIds[nextGroupIndex];
      nextGroupIndex += 1;
      return orders.find((entry) => entry._id === nextId) || order;
    });

    setOrders(nextOrders);
    setMovingOrderId(orderToMove._id);

    try {
      const data = await api.updateOrderSequence(nextOrders.map((order) => order._id));
      setOrders(data.orders || nextOrders);
      setToast({ type: "success", message: "Order sequence updated" });
      return true;
    } catch (error) {
      setToast({ type: "error", message: error.message });
      loadOrders();
      return false;
    } finally {
      setMovingOrderId(null);
    }
  }

  function openSequenceEditor(order, sequenceNumber, group = "pending") {
    setSequenceTarget(order);
    setSequenceGroup(group);
    setSequenceDraft(String(sequenceNumber));
  }

  async function submitSequenceChange(event) {
    event.preventDefault();
    if (!sequenceTarget || sequenceSaving) return;

    setSequenceSaving(true);
    const groupOrders = sequenceGroup === "completed" ? stats.completedOrders : stats.pendingOrders;
    const moved = await moveOrderToSequence(sequenceTarget, sequenceDraft, groupOrders);
    setSequenceSaving(false);

    if (moved) {
      setSequenceTarget(null);
      setSequenceGroup("pending");
      setSequenceDraft("");
    }
  }

  useEffect(() => {
    loadOrders();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const stats = useMemo(() => {
    const orderedEntries = [...orders].sort(compareOrderSequence);
    const completedOrders = orderedEntries.filter((order) => order.packedStatus === "Completed" || order.packedStatus === "Packed");
    const pendingOrders = orderedEntries.filter((order) => order.packedStatus !== "Completed" && order.packedStatus !== "Packed");
    const pendingProductQuantity = pendingOrders.reduce((orderSum, order) => {
      const orderPendingQuantity = (order.items || []).reduce(
        (itemSum, item) => itemSum + Math.max((item.quantity || 0) - (item.packedQuantity || 0), 0),
        0
      );
      return orderSum + orderPendingQuantity;
    }, 0);

    return {
      pendingOrders,
      completedOrders,
      pendingOrderCount: pendingOrders.length,
      completedOrderCount: completedOrders.length,
      pendingProductQuantity,
      trashOrderCount: trashedOrders.length
    };
  }, [orders, trashedOrders]);

  const cards = [
    {
      href: "/pending/orders",
      label: "Pending Orders",
      value: stats.pendingOrderCount,
      icon: TimerReset,
      color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100"
    },
    {
      href: "/pending/products",
      label: "Pending Products",
      value: stats.pendingProductQuantity,
      icon: Boxes,
      color: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-100"
    },
    {
      href: "#completed-orders",
      label: "Completed Orders",
      value: stats.completedOrderCount,
      icon: CheckCircle2,
      color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
    },
    {
      href: "/trash",
      label: "Trash",
      value: stats.trashOrderCount,
      icon: Trash2,
      color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-100"
    }
  ];
  const sequenceGroupOrders = sequenceGroup === "completed" ? stats.completedOrders : stats.pendingOrders;
  const sequenceGroupLabel = sequenceGroup === "completed" ? "completed" : "pending";

  return (
    <main className="min-h-screen safe-bottom">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="mx-auto max-w-6xl px-2.5 py-2.5 sm:px-5 sm:py-4 lg:px-8">
        <header className="-mx-2.5 mb-3 grid gap-1 border-b border-black/5 bg-limewash/95 px-2.5 py-2 backdrop-blur dark:border-white/5 dark:bg-[#101714]/95 sm:static sm:mx-0 sm:mb-5 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <StoreBrand />
        </header>

        <div className="mb-3 grid grid-cols-2 gap-1.5 sm:mb-4 sm:grid-cols-4 sm:gap-2">
          {cards.map((card) => {
            const Icon = card.icon;
            const content = (
              <>
                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:mb-2 sm:h-8 sm:w-8 ${card.color}`}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold leading-tight text-black/50 dark:text-white/50 sm:text-[11px]">{card.label}</p>
                  <p className="text-base font-black leading-tight sm:text-xl">{card.value || "\u00a0"}</p>
                </div>
              </>
            );

            return (
              <Link
                key={card.label}
                href={card.href}
                className="flex min-h-12 items-center gap-1.5 rounded-lg bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:bg-[#151f1a] sm:block sm:min-h-0 sm:p-3"
              >
                {content}
              </Link>
            );
          })}
        </div>

        <div className="grid gap-3 lg:gap-4">
          <div>
            <UploadInvoice onUploaded={loadOrders} onToast={setToast} />
          </div>
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold sm:text-base">Pending Orders</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSequenceMode((current) => !current)}
                  className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold sm:min-h-10 sm:text-sm ${sequenceMode ? "border-leaf bg-leaf text-white" : "border-black/10 bg-white dark:border-white/10 dark:bg-transparent"}`}
                >
                  <ListOrdered size={15} />
                  Sequence
                </button>
                <button
                  onClick={loadOrders}
                  disabled={loading}
                  aria-busy={loading ? "true" : undefined}
                  className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-60 dark:border-white/10 sm:min-h-10 sm:text-sm"
                >
                  {loading ? <Loader2 className="animate-spin" size={15} /> : null}
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            {loading ? (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
                ))}
              </div>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                {stats.pendingOrders.map((order, index) => (
                  <OrderCard
                    key={order._id}
                    order={order}
                    onDelete={deleteOrder}
                    compact
                    sequenceNumber={index + 1}
                    onSequenceClick={(entry) => openSequenceEditor(entry, index + 1, "pending")}
                    sequenceControls={sequenceMode}
                    onMoveUp={(entry) => moveOrder(entry, "up")}
                    onMoveDown={(entry) => moveOrder(entry, "down")}
                    canMoveUp={index > 0}
                    canMoveDown={index < stats.pendingOrders.length - 1}
                    moving={Boolean(movingOrderId)}
                  />
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
        <section id="completed-orders" className="mt-4 sm:mt-6">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-sm font-bold sm:text-base">Completed Orders</h2>
            {movingOrderId && <Loader2 className="animate-spin text-leaf" size={17} />}
          </div>
          {loading ? null : (
            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2 lg:grid-cols-3">
              {stats.completedOrders.map((order, index) => (
                <OrderCard
                  key={order._id}
                  order={order}
                  onDelete={deleteOrder}
                  compact
                  sequenceNumber={index + 1}
                  onSequenceClick={(entry) => openSequenceEditor(entry, index + 1, "completed")}
                  sequenceControls={sequenceMode}
                  onMoveUp={(entry) => moveOrder(entry, "up")}
                  onMoveDown={(entry) => moveOrder(entry, "down")}
                  canMoveUp={index > 0}
                  canMoveDown={index < stats.completedOrders.length - 1}
                  moving={Boolean(movingOrderId)}
                />
              ))}
              {!stats.completedOrders.length && (
                <div className="rounded-lg bg-white p-6 text-center text-sm text-black/55 dark:bg-[#151f1a] dark:text-white/55">
                  No completed orders.
                </div>
              )}
            </div>
          )}
        </section>
        <section className="mt-5 border-t border-black/10 pt-4 dark:border-white/10 sm:mt-6">
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className="min-h-11 w-full rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm dark:border-red-900/70 dark:bg-[#151f1a] dark:text-red-300 sm:w-auto"
          >
            Log Out
          </button>
        </section>
      </div>
      {logoutOpen && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-2.5 sm:place-items-center sm:p-3">
          <section className="w-full max-w-md rounded-lg bg-white p-3 shadow-soft dark:bg-[#151f1a] sm:p-4">
            <div className="mb-4">
              <h2 className="text-base font-black sm:text-lg">Log out?</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                You will need to enter the access code again to open the app.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLogoutOpen(false)}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={logout}
                className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white"
              >
                Log Out
              </button>
            </div>
          </section>
        </div>
      )}
      {sequenceTarget && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-3 sm:place-items-center">
          <form onSubmit={submitSequenceChange} className="w-full max-w-md rounded-lg bg-white p-4 shadow-soft dark:bg-[#151f1a]">
            <div className="mb-4">
              <h2 className="text-lg font-black">Change Sequence</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Move invoice <span className="font-bold text-black dark:text-white">{sequenceTarget.invoiceNo}</span> to {sequenceGroupLabel} sequence number.
              </p>
            </div>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-bold uppercase text-black/50 dark:text-white/50">Sequence No</span>
              <input
                type="number"
                min="1"
                max={sequenceGroupOrders.length}
                step="1"
                autoFocus
                value={sequenceDraft}
                onChange={(event) => setSequenceDraft(event.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-3 text-base font-bold outline-none focus:border-leaf dark:border-white/10 dark:bg-[#101712]"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSequenceTarget(null);
                  setSequenceGroup("pending");
                  setSequenceDraft("");
                }}
                disabled={sequenceSaving}
                className="min-h-11 rounded-lg border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sequenceSaving}
                aria-busy={sequenceSaving ? "true" : undefined}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {sequenceSaving ? <Loader2 className="animate-spin" size={16} /> : <ListOrdered size={16} />}
                {sequenceSaving ? "Changing..." : "Change"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
