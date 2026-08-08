'use client';

import React, { useEffect, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import { ShoppingBag, RefreshCw } from 'lucide-react';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  useEffect(() => {
    setPage(1); // reset to first page when the filter changes
  }, [filter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminOrders(filter, page, 20);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryFulfill = async (orderId: string) => {
    try {
      setRetrying(orderId);
      await api.retryFulfillment(orderId);
      await loadOrders();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Fulfillment retry failed');
      await loadOrders();
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
              Orders
            </h1>
            <p className="text-[11px] text-slate-500">Transactions, delivered keys and referral attribution.</p>
          </div>

          <div className="flex items-center gap-1.5">
            {['all', 'PAID', 'PENDING'].map((st) => (
              <button
                key={st}
                onClick={() => setFilter(st)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all border ${
                  filter === st
                    ? 'bg-amber-400/15 text-amber-300 border-amber-500/30'
                    : 'bg-white/[0.03] text-slate-500 border-white/10 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <div className="glass rounded-3xl overflow-hidden fade-up">
            <div className="overflow-x-auto">
              <table className="w-full table-base">
                <thead>
                  <tr>
                    <th>Tx Reference</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Referral</th>
                    <th>Status</th>
                    <th>Fulfillment</th>
                    <th>Key</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr><td colSpan={11} className="text-center text-slate-500 py-8">No orders found</td></tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-mono font-bold text-amber-400 whitespace-nowrap">{o.txRef}</td>
                      <td>
                        <div className="font-bold text-slate-100">{o.customerName}</div>
                        <div className="text-[10px] text-slate-500">{o.customerEmail}</div>
                        {o.telegramUsername && (
                          <div className="text-[10px] text-sky-400">@{o.telegramUsername}</div>
                        )}
                      </td>
                      <td className="font-semibold text-slate-200 whitespace-nowrap">{o.product?.name}</td>
                      <td className="font-bold text-center">{o.quantity || 1}</td>
                      <td className="font-black text-slate-100 whitespace-nowrap">{o.amount.toLocaleString()} {o.currency}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${
                          o.paymentMode === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-300'
                        }`}>
                          {o.paymentMode || 'mock'}
                        </span>
                      </td>
                      <td>
                        {o.refCode ? (
                          <span className="px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 font-bold text-[9px]">
                            {o.refCode}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          o.status === 'PAID' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-300'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td>
                        {o.fulfillmentStatus === 'DELIVERED' && (
                          <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-bold text-[9px]">DELIVERED</span>
                        )}
                        {o.fulfillmentStatus === 'FAILED' && (
                          <div className="space-y-1">
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-bold text-[9px]">FAILED</span>
                            <button
                              onClick={() => handleRetryFulfill(o.id)}
                              disabled={retrying === o.id}
                              className="block btn-ghost px-2 py-0.5 rounded-lg text-[9px] font-bold text-amber-300"
                            >
                              {retrying === o.id ? '…' : 'Retry'}
                            </button>
                          </div>
                        )}
                        {o.fulfillmentStatus === 'PENDING' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold text-[9px]">SENDING…</span>
                        )}
                        {(!o.fulfillmentStatus || o.fulfillmentStatus === 'NONE') && (
                          <span className="text-slate-600 text-[9px]">—</span>
                        )}
                      </td>
                      <td className="font-mono text-[10px] text-slate-400 max-w-[160px] truncate">
                        {o.licenseKey || '—'}
                      </td>
                      <td className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="text-[10px] text-slate-500 font-semibold">
                  {total} orders · page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page <= 1}
                    className="btn-ghost px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-300 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    disabled={page >= totalPages}
                    className="btn-ghost px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-300 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
