'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import R2ImagePicker from '@/components/R2ImagePicker';
import { api } from '@/lib/api';
import {
  Megaphone, Send, RefreshCw, X, Check, Loader2, AlertTriangle,
  Users, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Radio,
  Search, Package,
} from 'lucide-react';

const MAX_CAPTION = 1024;

type Preset = {
  key: string;
  productId: string;
  name: string;
  price: number | null;
  currency: string;
  stock: number | null;
  imageUrl: string;
  productUrl: string;
  caption: string
  buttonText: string;
  available: boolean;
};

type BroadcastReport = {
  id: string;
  productId: string | null;
  productName: string;
  productUrl: string;
  imageUrl: string;
  caption: string;
  buttonText: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  total: number;
  sent: number;
  failed: number;
  failureSummary: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** Very small HTML-ish renderer for the Telegram preview (bold + line breaks). */
function CaptionPreview({ text }: { text: string }) {
  const html = useMemo(
    () =>
      text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>')
        .replace(/\n/g, '<br/>'),
    [text],
  );
  return (
    <p
      className="text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function StatusBadge({ status }: { status: BroadcastReport['status'] }) {
  const map = {
    RUNNING: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    FAILED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  } as const;
  const Icon = { RUNNING: Radio, COMPLETED: CheckCircle2, FAILED: XCircle }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black tracking-wide ${map[status]}`}>
      <Icon className={`w-3 h-3 ${status === 'RUNNING' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

export default function BroadcastPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [reports, setReports] = useState<BroadcastReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Campaign editor state
  const [selected, setSelected] = useState<Preset | null>(null);
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [buttonText, setButtonText] = useState('');

  // Send flow
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState<BroadcastReport | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reports UI
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Product picker (any product, not just presets)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  /** Store base URL derived from preset product URLs (no extra API needed). */
  const storeUrl = useMemo(
    () => (presets[0]?.productUrl || '').replace(/\/product\/.*$/, ''),
    [presets],
  );

  const openPicker = async () => {
    setPickerOpen(true);
    if (allProducts.length > 0) return;
    setProductsLoading(true);
    try {
      const products = await api.getAdminProducts();
      setAllProducts(Array.isArray(products) ? products : []);
    } catch {
      setAllProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const pickCustomProduct = (p: any) => {
    const price = p.price != null ? `${Number(p.price).toLocaleString()} ${p.currency || 'ETB'}` : '';
    const preset: Preset = {
      key: 'custom',
      productId: p.id,
      name: p.name,
      price: p.price ?? null,
      currency: p.currency || 'ETB',
      stock: p.stock ?? null,
      imageUrl: p.bannerUrl || '',
      productUrl: `${storeUrl}/product/${p.id}`,
      caption:
        `🔥 <b>${p.name} አሁን ይገኛል!</b>\n` +
        (price ? `ዋጋ: ${price} ብቻ — ብዛት ውስን ነው፣ አሁን ይዘዙ!\n\n` : '\n') +
        `⚡ <b>${p.name} is available now!</b>\n` +
        (price ? `Only ${price} — limited stock, order now before it's gone!` : 'Limited stock — order now before it’s gone!'),
      buttonText: '🛒 Buy Now',
      available: true,
    };
    setPickerOpen(false);
    pickPreset(preset);
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return allProducts;
    return allProducts.filter((p) =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.slug || '').toLowerCase().includes(q),
    );
  }, [allProducts, productSearch]);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api.getBroadcastPresets(), api.getBroadcasts()]);
      setPresets(Array.isArray(p) ? p : []);
      setReports(Array.isArray(r) ? r : []);
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load broadcast center');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll the active broadcast while it runs
  useEffect(() => {
    if (!active || active.status !== 'RUNNING') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const fresh: BroadcastReport = await api.getBroadcast(active.id);
        setActive(fresh);
        if (fresh.status !== 'RUNNING') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          load();
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [active, load]);

  const pickPreset = (preset: Preset) => {
    setSelected(preset);
    setCaption(preset.caption);
    setImageUrl(preset.imageUrl);
    setButtonText(preset.buttonText);
    setConfirmOpen(false);
  };

  const canSend =
    !!selected && caption.trim().length > 0 && caption.length <= MAX_CAPTION &&
    /^https?:\/\//i.test(imageUrl) && buttonText.trim().length > 0 && !sending;

  const doSend = async () => {
    if (!selected || !canSend) return;
    setSending(true);
    setError('');
    try {
      const record: BroadcastReport = await api.sendBroadcast({
        productId: selected.productId,
        caption: caption.trim(),
        imageUrl: imageUrl.trim(),
        buttonText: buttonText.trim(),
      });
      setConfirmOpen(false);
      setActive(record);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Broadcast failed to start');
    } finally {
      setSending(false);
    }
  };

  const progress = active && active.total > 0
    ? Math.min(100, Math.round(((active.sent + active.failed) / active.total) * 100))
    : 0;

  return (
    <div className="min-h-screen">
      <AdminNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 fade-up">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-amber-400" />
              Broadcast Center
            </h1>
            <p className="text-[11px] text-slate-500 mt-1">
              Send product campaigns with an image and button to every reachable Telegram user.
            </p>
          </div>
          <button onClick={load} className="btn-ghost w-9 h-9 rounded-xl flex items-center justify-center text-slate-400" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-bold flex items-center gap-2 fade-up">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-[11px] font-bold">Loading broadcast center…</span>
          </div>
        ) : (
          <>
            {/* Live progress banner */}
            {active && (
              <div className="glass rounded-3xl p-5 fade-up space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <img src={active.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10" />
                    <div>
                      <div className="text-sm font-black text-white">{active.productName}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Started {fmtDate(active.createdAt)}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={active.status} />
                </div>

                <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      active.status === 'FAILED' ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-400 to-orange-500'
                    }`}
                    style={{ width: `${active.status === 'RUNNING' ? progress : 100}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Recipients', value: active.total, Icon: Users, tone: 'text-slate-200' },
                    { label: 'Delivered', value: active.sent, Icon: CheckCircle2, tone: 'text-emerald-300' },
                    { label: 'Failed', value: active.failed, Icon: XCircle, tone: 'text-rose-300' },
                  ].map(({ label, value, Icon, tone }) => (
                    <div key={label} className="rounded-2xl bg-white/[0.03] border border-white/5 px-3 py-2.5 text-center">
                      <Icon className={`w-4 h-4 mx-auto mb-1 ${tone}`} />
                      <div className={`text-lg font-black ${tone}`}>{value.toLocaleString()}</div>
                      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
                    </div>
                  ))}
                </div>

                {active.status === 'RUNNING' && (
                  <p className="text-[10px] text-slate-500 text-center font-bold">
                    Sending in batches — {progress}% complete. You can leave this page; the broadcast continues.
                  </p>
                )}
                {active.status === 'FAILED' && active.error && (
                  <p className="text-[10px] text-rose-300 text-center font-bold">⚠ {active.error}</p>
                )}
              </div>
            )}

            {/* Preset cards */}
            <div className="fade-up">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Ready campaigns</h2>
                <button
                  onClick={openPicker}
                  className="btn-ghost rounded-xl px-3 py-2 text-[10px] font-black text-amber-300 flex items-center gap-1.5 border border-amber-500/25"
                >
                  <Package className="w-3.5 h-3.5" />
                  + Any other product
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {presets.map((preset) => {
                  const isSelected = selected?.productId === preset.productId;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => pickPreset(preset)}
                      className={`glass rounded-3xl overflow-hidden text-left transition-all group ${
                        isSelected ? 'ring-2 ring-amber-400/70' : 'hover:ring-1 hover:ring-white/20'
                      }`}
                    >
                      <div className="relative h-32 bg-slate-900">
                        {preset.imageUrl ? (
                          <img src={preset.imageUrl} alt={preset.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-700">
                            <Megaphone className="w-8 h-8" />
                          </div>
                        )}
                        {preset.stock !== null && (
                          <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black border ${
                            preset.stock > 0
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}>
                            {preset.stock > 0 ? `${preset.stock} in stock` : 'Out of stock'}
                          </span>
                        )}
                        {isSelected && (
                          <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="text-[13px] font-black text-white truncate">{preset.name}</div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-amber-300 font-black text-sm">
                            {preset.price !== null ? `${preset.price.toLocaleString()} ${preset.currency}` : '—'}
                          </span>
                          <span className={`text-[10px] font-black ${isSelected ? 'text-amber-300' : 'text-slate-500 group-hover:text-slate-300'}`}>
                            {isSelected ? 'SELECTED' : 'USE CAMPAIGN →'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campaign editor + preview */}
            {selected && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 fade-up">
                {/* Editor */}
                <div className="glass rounded-3xl p-5 space-y-4">
                  <h2 className="text-sm font-black text-white">Campaign for {selected.name}</h2>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Image</label>
                    <R2ImagePicker folder="broadcasts" accent="amber" onAdd={(url) => setImageUrl(url)} />
                    {imageUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                        <span className="text-[9px] text-slate-500 break-all flex-1">{imageUrl}</span>
                        <button onClick={() => setImageUrl('')} className="btn-ghost w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-300">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Caption</label>
                      <span className={`text-[9px] font-black ${caption.length > MAX_CAPTION ? 'text-rose-400' : 'text-slate-500'}`}>
                        {caption.length}/{MAX_CAPTION}
                      </span>
                    </div>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      rows={8}
                      className="input-dark w-full rounded-2xl px-3 py-2.5 text-[12px] leading-relaxed resize-y"
                      placeholder="Message text… <b>bold</b> is supported"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Button text</label>
                    <input
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      maxLength={64}
                      className="input-dark w-full rounded-2xl px-3 py-2.5 text-[12px]"
                      placeholder="🛒 Buy now"
                    />
                    <p className="text-[9px] text-slate-600 mt-1.5">Opens: {selected.productUrl}</p>
                  </div>

                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSend}
                    className="btn-primary w-full rounded-2xl py-3 text-[12px] font-black flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Review &amp; Send
                  </button>
                </div>

                {/* Telegram-style preview */}
                <div className="glass rounded-3xl p-5">
                  <h2 className="text-sm font-black text-white mb-4">Preview</h2>
                  <div className="max-w-sm mx-auto rounded-2xl overflow-hidden border border-white/10 bg-[#0e1621] shadow-2xl">
                    {imageUrl && (
                      <img src={imageUrl} alt="" className="w-full aspect-[4/3] object-cover" />
                    )}
                    <div className="p-3">
                      <CaptionPreview text={caption} />
                    </div>
                    {buttonText && (
                      <div className="px-3 pb-3">
                        <div className="w-full py-2 rounded-lg bg-[#2b5278]/60 text-center text-[12px] font-bold text-sky-300 border border-sky-500/20">
                          {buttonText}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Reports */}
            <div className="fade-up">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">
                Broadcast history ({reports.length})
              </h2>
              {reports.length === 0 ? (
                <div className="glass rounded-3xl py-14 flex flex-col items-center gap-2 text-slate-600">
                  <Megaphone className="w-8 h-8" />
                  <span className="text-[11px] font-bold">No broadcasts yet — pick a campaign above</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((r) => {
                    const expanded = expandedId === r.id;
                    const failures: [string, number][] = (() => {
                      try {
                        return Object.entries(JSON.parse(r.failureSummary || '{}')) as [string, number][];
                      } catch { return []; }
                    })();
                    return (
                      <div key={r.id} className="glass rounded-3xl overflow-hidden">
                        <button
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className="w-full flex items-center gap-3 p-4 text-left"
                        >
                          <img src={r.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-black text-white truncate">{r.productName}</span>
                              <StatusBadge status={r.status} />
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {fmtDate(r.createdAt)}
                              {r.completedAt && ` → ${fmtDate(r.completedAt)}`}
                            </div>
                          </div>
                          <div className="hidden sm:flex items-center gap-4 text-[10px] font-black shrink-0">
                            <span className="text-slate-400">{r.total.toLocaleString()} total</span>
                            <span className="text-emerald-300">{r.sent.toLocaleString()} delivered</span>
                            <span className="text-rose-300">{r.failed.toLocaleString()} failed</span>
                          </div>
                          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                        </button>

                        {expanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                            <div className="sm:hidden flex items-center gap-4 text-[10px] font-black">
                              <span className="text-slate-400">{r.total} total</span>
                              <span className="text-emerald-300">{r.sent} delivered</span>
                              <span className="text-rose-300">{r.failed} failed</span>
                            </div>
                            {r.error && (
                              <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px] font-bold">
                                ⚠ {r.error}
                              </div>
                            )}
                            <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-3">
                              <CaptionPreview text={r.caption} />
                            </div>
                            {failures.length > 0 && (
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Failure breakdown</div>
                                <div className="space-y-1">
                                  {failures.map(([desc, count]) => (
                                    <div key={desc} className="flex items-center justify-between text-[10px] px-3 py-1.5 rounded-lg bg-white/[0.02]">
                                      <span className="text-slate-400 truncate mr-2">{desc}</span>
                                      <span className="text-rose-300 font-black shrink-0">{count}×</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <a
                              href={r.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-black text-sky-300 hover:text-sky-200"
                            >
                              {r.buttonText} → {r.productUrl}
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Product picker modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="glass rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-sm font-black text-white">Pick a product</h3>
                <p className="text-[10px] text-slate-500">Broadcast any product in the store</p>
              </div>
              <button
                onClick={() => setPickerOpen(false)}
                className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-white/5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products…"
                  autoFocus
                  className="input-dark w-full rounded-xl pl-9 pr-3 py-2.5 text-[12px]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {productsLoading ? (
                <div className="py-14 flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[11px] font-bold">Loading products…</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-2 text-slate-600">
                  <Package className="w-7 h-7" />
                  <span className="text-[11px] font-bold">No products match</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pickCustomProduct(p)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-transparent hover:border-white/15 hover:bg-white/[0.04] text-left transition-colors"
                    >
                      {p.bannerUrl ? (
                        <img src={p.bannerUrl} alt="" className="w-11 h-11 rounded-xl object-cover border border-white/10 shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-slate-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-black text-white truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.price != null ? `${Number(p.price).toLocaleString()} ${p.currency || 'ETB'}` : '—'}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border shrink-0 ${
                        (p.stock ?? 0) > 0
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}>
                        {(p.stock ?? 0) > 0 ? `${p.stock} left` : 'out'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && selected && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !sending && setConfirmOpen(false)}
        >
          <div
            className="glass rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-sm font-black text-white">Confirm broadcast</h3>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
                className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-2xl overflow-hidden border border-white/10">
                {imageUrl && <img src={imageUrl} alt="" className="w-full aspect-[4/3] object-cover" />}
                <div className="p-3 bg-[#0e1621]">
                  <CaptionPreview text={caption} />
                  <div className="mt-2 py-2 rounded-lg bg-[#2b5278]/60 text-center text-[11px] font-bold text-sky-300">
                    {buttonText}
                  </div>
                </div>
              </div>

              <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-bold leading-relaxed">
                ⚠ This sends a Telegram message with this image to <b>every reachable user</b> of the bot
                (typically 2,000+). It cannot be undone.
              </div>

              <button
                onClick={doSend}
                disabled={sending}
                className="btn-primary w-full rounded-2xl py-3 text-[12px] font-black flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Starting…' : 'Send Broadcast Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
