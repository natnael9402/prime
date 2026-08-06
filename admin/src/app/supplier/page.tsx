'use client';

import React, { useEffect, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  Layers, RefreshCw, Wallet, Package, CheckCircle2, AlertTriangle,
  Download, FlaskConical, Zap,
} from 'lucide-react';
import SupplierImportModal from '@/components/SupplierImportModal';

export default function AdminSupplierPage() {
  const [status, setStatus] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [importForm, setImportForm] = useState<{
    supplierProductId: string; categoryId: string; margin: string; discount: string;
  }>({ supplierProductId: '', categoryId: '', margin: '', discount: '' });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');
      const [st, cats, sets] = await Promise.all([
        api.getSupplierStatus(),
        api.getCategories(),
        api.getSettings(),
      ]);
      setStatus(st);
      setCategories(cats);
      setSettings(sets);
      if (cats.length && !importForm.categoryId) {
        setImportForm((f) => ({ ...f, categoryId: cats[0].id }));
      }
      if (st.configured) {
        try {
          const prods = await api.getSupplierProducts();
          setProducts(prods);
        } catch (err: any) {
          setError(err.response?.data?.message || err.message);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const openImportStudio = (sp: any) => {
    setSelectedProduct(sp);
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await api.syncSupplierStock();
      alert(`Synced ${res.synced} products`);
      await loadAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="fade-up">
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-400" />
            HubX Supplier
          </h1>
          <p className="text-[11px] text-slate-500">
            Import products from the reseller API. Cost is in USDT — your sell price is computed by the pricing engine.
          </p>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 fade-up">
          <div className={`rounded-2xl border p-4 space-y-1.5 ${status?.configured ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>API Key</span>
              {status?.configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            </div>
            <div className="text-base font-black text-white">
              {status?.configured ? (status.keyMode === 'test' ? 'Sandbox (test)' : 'Live') : 'Not configured'}
            </div>
            {!status?.configured && (
              <p className="text-[10px] text-slate-500 leading-snug">
                Get a free key: HubX bot → Reseller API → Get Sandbox Key, then set SUPPLIER_API_KEY in backend/.env
              </p>
            )}
          </div>

          <div className="rounded-2xl border p-4 space-y-1.5 bg-sky-500/10 border-sky-500/20">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>Wallet Balance</span>
              <Wallet className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-base font-black text-white">
              {status?.balance ? `${status.balance.balance_usdt} USDT` : '—'}
            </div>
            {status?.balanceError && <p className="text-[10px] text-rose-400">{status.balanceError}</p>}
          </div>

          <div className="rounded-2xl border p-4 space-y-1.5 bg-amber-500/10 border-amber-500/20">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>Pricing Engine</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-[11px] font-bold text-slate-200">
              $1 → {settings?.usdToEtb} ETB × {settings?.marginMultiplier} margin
            </div>
            <p className="text-[10px] text-slate-500">$1 cost = {(settings?.usdToEtb * settings?.marginMultiplier)?.toLocaleString()} ETB before discounts</p>
          </div>
        </div>

        {status?.keyMode === 'test' && (
          <div className="fade-up flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-bold">
            <FlaskConical className="w-4 h-4" />
            Sandbox key active — orders return dummy items and never touch the wallet.
          </div>
        )}

        {/* Import defaults */}
        {status?.configured && products.length > 0 && (
          <div className="fade-up glass rounded-2xl p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Import into category</label>
              <select
                value={importForm.categoryId}
                onChange={(e) => setImportForm({ ...importForm, categoryId: e.target.value })}
                className="input-dark rounded-xl px-3 py-2 text-[11px] text-slate-100"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Margin override (×)</label>
              <input
                type="number" step="0.1" placeholder={`global ${settings?.marginMultiplier}`}
                value={importForm.margin}
                onChange={(e) => setImportForm({ ...importForm, margin: e.target.value })}
                className="input-dark rounded-xl px-3 py-2 text-[11px] text-slate-100 w-28"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Discount %</label>
              <input
                type="number" min="0" max="95" placeholder="0"
                value={importForm.discount}
                onChange={(e) => setImportForm({ ...importForm, discount: e.target.value })}
                className="input-dark rounded-xl px-3 py-2 text-[11px] text-slate-100 w-20"
              />
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-ghost px-4 py-2 rounded-xl text-[11px] font-bold text-sky-300 flex items-center gap-1.5 ml-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              Sync stock & prices
            </button>
          </div>
        )}

        {/* Supplier catalog */}
        {loading ? (
          <div className="py-24 flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
          </div>
        ) : error ? (
          <div className="fade-up glass rounded-3xl p-8 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm font-bold text-rose-300">{error}</p>
          </div>
        ) : status?.configured ? (
          <div className="glass rounded-3xl overflow-hidden fade-up">
            <div className="overflow-x-auto">
              <table className="w-full table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Cost (USDT)</th>
                    <th>Sell Price (ETB)</th>
                    <th>Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-slate-500 py-8">No supplier products</td></tr>
                  )}
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="font-bold text-slate-100">{p.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{p.slug}</div>
                      </td>
                      <td className="font-bold text-sky-300">${p.price_usdt}</td>
                      <td className="font-black text-amber-400">{p.pricePreviewETB?.toLocaleString()} ETB</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          p.unlimited ? 'bg-sky-500/15 text-sky-300' : p.stock > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {p.unlimited ? '∞' : p.stock}
                        </span>
                      </td>
                      <td>
                        {p.importedLocalId ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Imported
                          </span>
                        ) : (
                          <button
                            onClick={() => openImportStudio(p)}
                            className="btn-primary px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Import
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="fade-up glass rounded-3xl p-10 text-center space-y-3">
            <Package className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Connect your HubX reseller key to see the catalog</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
              1. Open the HubX Telegram bot → Reseller API → Get Sandbox Key (free).<br />
              2. Add <code className="text-amber-400">SUPPLIER_API_KEY="rsk_test_…"</code> to backend/.env.<br />
              3. Restart the backend — this page lights up.
            </p>
          </div>
        )}
      </main>

      {selectedProduct && (
        <SupplierImportModal
          supplierProduct={selectedProduct}
          categories={categories}
          settings={settings}
          defaultCategoryId={importForm.categoryId}
          defaultMargin={importForm.margin}
          defaultDiscount={importForm.discount}
          onClose={() => setSelectedProduct(null)}
          onImported={loadAll}
        />
      )}
    </div>
  );
}
