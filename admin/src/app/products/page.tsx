'use client';

import React, { useEffect, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import { Plus, Trash2, Key, RefreshCw, X, Package, Settings2, Pencil, Bell, BellRing } from 'lucide-react';
import ProductEditorModal from '@/components/ProductEditorModal';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProduct, setEditorProduct] = useState<any | null>(null);

  // Key pool manager state
  const [keysProduct, setKeysProduct] = useState<any>(null);
  const [productKeys, setProductKeys] = useState<any[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeys, setNewKeys] = useState('');
  const [addingKeys, setAddingKeys] = useState(false);

  // Stock-alert subscribers modal state
  const [alertsProduct, setAlertsProduct] = useState<any>(null);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);

  // Pricing editor state
  const [pricingProduct, setPricingProduct] = useState<any>(null);
  const [pricingForm, setPricingForm] = useState({
    priceMode: 'MANUAL',
    costUSD: '',
    marginMultiplier: '',
    discountPct: '0',
    manualPrice: '',
  });
  const [savingPricing, setSavingPricing] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prods, cats, sets] = await Promise.all([
        api.getAdminProducts(),
        api.getCategories(),
        api.getSettings().catch(() => null),
      ]);
      setProducts(prods);
      setCategories(cats);
      setGlobalSettings(sets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openAlerts = async (p: any) => {
    setAlertsProduct(p);
    setSubsLoading(true);
    setSubscribers([]);
    try {
      setSubscribers(await api.getStockAlerts(p.id));
    } catch (err) {
      console.error(err);
    } finally {
      setSubsLoading(false);
    }
  };

  const openPricing = (p: any) => {
    setPricingProduct(p);
    setPricingForm({
      priceMode: p.priceMode || 'MANUAL',
      costUSD: p.costUSD != null ? String(p.costUSD) : '',
      marginMultiplier: p.marginMultiplier != null ? String(p.marginMultiplier) : '',
      discountPct: String(p.discountPct || 0),
      manualPrice: String(p.originalPrice || p.price),
    });
  };

  const pricingPreview = () => {
    const rate = globalSettings?.usdToEtb || 200;
    const globalMargin = globalSettings?.marginMultiplier || 3;
    const globalDisc = globalSettings?.globalDiscountPct || 0;
    const cost = parseFloat(pricingForm.costUSD);
    if (pricingForm.priceMode === 'AUTO' && !isNaN(cost)) {
      const margin = parseFloat(pricingForm.marginMultiplier) || globalMargin;
      const base = Math.round(cost * rate * margin);
      const disc = Math.min(95, globalDisc + (parseFloat(pricingForm.discountPct) || 0));
      const final = Math.max(1, Math.round(base * (1 - disc / 100)));
      return { base, final, disc };
    }
    const manual = parseFloat(pricingForm.manualPrice) || 0;
    const disc = Math.min(95, globalDisc + (parseFloat(pricingForm.discountPct) || 0));
    const final = Math.max(1, Math.round(manual * (1 - disc / 100)));
    return { base: manual, final, disc };
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pricingProduct) return;
    try {
      setSavingPricing(true);
      await api.updateProductPricing(pricingProduct.id, {
        priceMode: pricingForm.priceMode,
        costUSD: pricingForm.costUSD ? Number(pricingForm.costUSD) : null,
        marginMultiplier: pricingForm.marginMultiplier ? Number(pricingForm.marginMultiplier) : null,
        discountPct: Number(pricingForm.discountPct) || 0,
        manualPrice: pricingForm.priceMode === 'MANUAL' ? Number(pricingForm.manualPrice) : undefined,
      });
      setPricingProduct(null);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Pricing save failed');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product, its keys, and any orders placed for it? This cannot be undone.')) return;
    try {
      await api.deleteProduct(id);
      loadData();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      alert(`Delete failed${msg ? `: ${Array.isArray(msg) ? msg.join(', ') : msg}` : ''}`);
    }
  };

  const openKeyPool = async (product: any) => {
    setKeysProduct(product);
    setNewKeys('');
    setKeysLoading(true);
    try {
      const keys = await api.getProductKeys(product.id);
      setProductKeys(keys);
    } catch {
      setProductKeys([]);
    } finally {
      setKeysLoading(false);
    }
  };

  const handleAddKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    const keys = newKeys.split('\n').map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0 || !keysProduct) return;
    try {
      setAddingKeys(true);
      await api.addProductKeys(keysProduct.id, keys);
      setNewKeys('');
      await openKeyPool(keysProduct);
      loadData();
    } catch {
      alert('Failed to add keys');
    } finally {
      setAddingKeys(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between fade-up">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              Products & Key Pools
            </h1>
            <p className="text-[11px] text-slate-500">Add products, manage pricing and license key stock.</p>
          </div>
          <button
            onClick={() => {
              setEditorProduct(null);
              setEditorOpen(true);
            }}
            className="btn-primary px-4 py-2 rounded-xl text-[11px] font-black flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>New Product</span>
          </button>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p, idx) => (
              <div key={p.id} className="fade-up glass rounded-2xl p-4 space-y-3 flex flex-col" style={{ animationDelay: `${Math.min(idx, 9) * 40}ms` }}>
                <div className="relative h-32 rounded-xl overflow-hidden bg-[#070b14] border border-white/5">
                  <img src={p.bannerUrl} alt={p.name} className="w-full h-full object-cover" />
                  <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black ${
                    p.stock > 0 ? 'bg-emerald-500/90 text-slate-950' : 'bg-rose-500 text-white'
                  }`}>
                    {p.stock} keys
                  </span>
                  {p.source === 'HUBX' && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-sky-500 text-white">
                      HubX
                    </span>
                  )}
                  {(p.discountPct > 0) && (
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white">
                      -{p.discountPct}%
                    </span>
                  )}
                  {(p.alertsCount > 0) && (
                    <button
                      onClick={() => openAlerts(p)}
                      title="Back-in-stock subscribers"
                      className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-400 text-slate-950 flex items-center gap-1 hover:scale-105 transition-transform"
                    >
                      <BellRing className="w-3 h-3" />
                      {p.alertsCount}
                    </button>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="text-[13px] font-black text-white">{p.name}</h3>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{p.shortDesc}</p>
                  {p.costUSD != null && (
                    <p className="text-[10px] text-sky-400/90 font-bold mt-1">
                      Cost ${p.costUSD} • {p.priceMode === 'AUTO' ? `auto ×${p.marginMultiplier || globalSettings?.marginMultiplier}` : 'manual'}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                  <div className="flex flex-col">
                    {p.originalPrice && p.originalPrice > p.price && (
                      <span className="text-[9px] text-slate-600 line-through">{p.originalPrice.toLocaleString()}</span>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-gradient">{p.price.toLocaleString()}</span>
                      <span className="text-[10px] font-bold text-slate-500">{p.currency}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditorProduct(p);
                        setEditorOpen(true);
                      }}
                      className="btn-ghost px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white flex items-center gap-1"
                      title="Edit product"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => openPricing(p)}
                      className="btn-ghost px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-300 flex items-center gap-1"
                    >
                      <Settings2 className="w-3 h-3" />
                      Price
                    </button>
                    <button
                      onClick={() => openKeyPool(p)}
                      className="btn-ghost px-3 py-1.5 rounded-lg text-[10px] font-bold text-sky-300 flex items-center gap-1"
                    >
                      <Key className="w-3 h-3" />
                      Keys
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* PRICING MODAL */}
      {pricingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass rounded-3xl w-full max-w-md p-5 space-y-4 fade-up">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-amber-400" />
                <span>Pricing — {pricingProduct.name}</span>
              </h2>
              <button onClick={() => setPricingProduct(null)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePricing} className="space-y-3 text-[11px]">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'AUTO', label: 'Auto (from $ cost)' },
                  { id: 'MANUAL', label: 'Manual (fixed ETB)' },
                ].map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setPricingForm({ ...pricingForm, priceMode: m.id })}
                    className={`py-2.5 rounded-xl font-black border transition-all ${
                      pricingForm.priceMode === m.id
                        ? 'bg-amber-400/15 border-amber-500/40 text-amber-300'
                        : 'bg-white/[0.03] border-white/10 text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {pricingForm.priceMode === 'AUTO' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">Cost (USD)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={pricingForm.costUSD}
                        onChange={(e) => setPricingForm({ ...pricingForm, costUSD: e.target.value })}
                        placeholder="1.00"
                        className="w-full input-dark rounded-xl px-3 py-2 text-sky-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-bold mb-1">Margin × (blank = global)</label>
                      <input
                        type="number" step="0.1" min="0"
                        value={pricingForm.marginMultiplier}
                        onChange={(e) => setPricingForm({ ...pricingForm, marginMultiplier: e.target.value })}
                        placeholder={String(globalSettings?.marginMultiplier || 3)}
                        className="w-full input-dark rounded-xl px-3 py-2 text-slate-100"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Sell price (ETB)</label>
                  <input
                    type="number" min="1"
                    value={pricingForm.manualPrice}
                    onChange={(e) => setPricingForm({ ...pricingForm, manualPrice: e.target.value })}
                    className="w-full input-dark rounded-xl px-3 py-2 text-amber-300 font-black"
                  />
                </div>
              )}

              <div>
                <label className="block text-rose-400 font-bold mb-1">Product discount %</label>
                <input
                  type="number" min="0" max="95"
                  value={pricingForm.discountPct}
                  onChange={(e) => setPricingForm({ ...pricingForm, discountPct: e.target.value })}
                  className="w-full input-dark rounded-xl px-3 py-2 text-rose-300 font-black"
                />
              </div>

              {/* Live preview */}
              {(() => {
                const pv = pricingPreview();
                return (
                  <div className="rounded-2xl bg-amber-400/10 border border-amber-500/25 p-3.5 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Storefront preview</div>
                    <div className="flex items-baseline gap-2">
                      {pv.disc > 0 && <span className="text-[11px] text-slate-500 line-through">{pv.base.toLocaleString()} ETB</span>}
                      <span className="text-xl font-black text-gradient">{pv.final.toLocaleString()} ETB</span>
                      {pv.disc > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-black">-{pv.disc}%</span>
                      )}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      rate {globalSettings?.usdToEtb} × margin × discount — global discount {globalSettings?.globalDiscountPct}% included
                    </div>
                  </div>
                );
              })()}

              <button type="submit" disabled={savingPricing} className="btn-primary w-full py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2">
                {savingPricing ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save pricing'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* KEY POOL MODAL */}
      {keysProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-5 space-y-4 fade-up">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-sky-400" />
                <span>Key Pool — {keysProduct.name}</span>
              </h2>
              <button onClick={() => setKeysProduct(null)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddKeys} className="space-y-2">
              <label className="text-[10px] font-bold text-sky-300 uppercase tracking-wide">Add keys (1 per line)</label>
              <textarea
                rows={3}
                value={newKeys}
                onChange={(e) => setNewKeys(e.target.value)}
                placeholder={'KEY-AAAA-1111\nKEY-BBBB-2222'}
                className="w-full input-dark rounded-xl px-3 py-2 text-[11px] text-sky-300 font-mono"
              />
              <button type="submit" disabled={addingKeys} className="btn-success w-full py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5">
                {addingKeys ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 stroke-[3]" />}
                Add to Pool
              </button>
            </form>

            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Current pool ({keysLoading ? '…' : productKeys.length})
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {keysLoading ? (
                  <div className="py-6 flex justify-center"><RefreshCw className="w-4 h-4 animate-spin text-sky-400" /></div>
                ) : productKeys.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-3 text-center">Pool is empty — add keys above.</p>
                ) : (
                  productKeys.map((k) => (
                    <div
                      key={k.id}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border font-mono text-[11px] ${
                        k.isUsed
                          ? 'bg-white/[0.02] border-white/5 text-slate-600 line-through'
                          : 'bg-sky-500/5 border-sky-500/20 text-sky-300'
                      }`}
                    >
                      <span className="truncate">{k.code}</span>
                      <span className={`text-[9px] font-bold shrink-0 ml-2 ${k.isUsed ? 'text-slate-600' : 'text-emerald-400'}`}>
                        {k.isUsed ? 'USED' : 'READY'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STOCK-ALERT SUBSCRIBERS MODAL */}
      {alertsProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4 fade-up">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>Stock Alerts — {alertsProduct.name}</span>
              </h2>
              <button onClick={() => setAlertsProduct(null)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[10px] text-slate-500 font-semibold">
              These users tapped "Notify me" and will get a Telegram message the moment keys are added.
            </p>

            {subsLoading ? (
              <div className="py-8 flex justify-center">
                <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
              </div>
            ) : subscribers.length === 0 ? (
              <p className="text-[11px] text-slate-500 py-4 text-center">Nobody is waiting on this product.</p>
            ) : (
              <div className="space-y-1.5">
                {subscribers.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-slate-100 truncate">
                        {s.firstName || 'Telegram user'}
                        {s.username && <span className="text-sky-400 font-semibold ml-1.5">@{s.username}</span>}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono">ID {s.telegramUserId}</div>
                    </div>
                    <span className="text-[9px] text-slate-500 shrink-0 ml-2">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editorOpen && (
        <ProductEditorModal
          product={editorProduct}
          categories={categories}
          settings={globalSettings}
          onClose={() => setEditorOpen(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
