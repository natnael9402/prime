'use client';

import React, { useEffect, useState } from 'react';
import AdminNavbar from '@/components/AdminNavbar';
import { api } from '@/lib/api';
import {
  Sparkles, HandCoins, Zap, ShieldCheck, Package, Plus, Pencil, Trash2,
  RefreshCw, X, Check, Link2, MousePointerClick, Layers, ImagePlus, Images,
} from 'lucide-react';

const ICON_OPTIONS = [
  { value: 'sparkles', label: 'Sparkles', Icon: Sparkles },
  { value: 'handcoins', label: 'Hand Coins', Icon: HandCoins },
  { value: 'zap', label: 'Zap', Icon: Zap },
  { value: 'shield', label: 'Shield', Icon: ShieldCheck },
  { value: 'package', label: 'Package', Icon: Package },
];

const EMPTY_FORM = {
  enabled: true,
  order: 0,
  kind: 'hero',
  badgeText: '',
  title: '',
  subtitle: '',
  icon: 'sparkles',
  linkType: 'none',
  productId: '',
  linkUrl: '',
  animatedBorder: false,
  priceText: '',
  imageUrl: '',
  borderStyle: '',
};

export default function HomeCardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ ...EMPTY_FORM });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  /** Open the R2 library and load previous card uploads. */
  const openLibrary = async () => {
    setLibraryOpen(true);
    setLibraryLoading(true);
    try {
      const images = await api.listUploadedImages('cards');
      setLibrary(Array.isArray(images) ? images : []);
    } catch {
      setLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  /** Upload picked image to R2 and attach its CDN URL to the form. */
  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { url } = await api.uploadImage(file, 'cards');
      setForm((f: any) => ({ ...f, imageUrl: url }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Image upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const [c, p] = await Promise.all([api.getHomeCardsAdmin(), api.getAdminProducts().catch(() => api.getProducts())]);
      setCards(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, order: cards.length });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (card: any) => {
    setEditing(card);
    setForm({
      enabled: card.enabled,
      order: card.order,
      kind: card.kind,
      badgeText: card.badgeText || '',
      title: card.title || '',
      subtitle: card.subtitle || '',
      icon: card.icon || 'sparkles',
      linkType: card.linkType || 'none',
      productId: card.productId || '',
      linkUrl: card.linkUrl || '',
      animatedBorder: !!card.animatedBorder,
      priceText: card.priceText || '',
      imageUrl: card.imageUrl || '',
      borderStyle: card.borderStyle || '',
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (form.linkType === 'product' && !form.productId) {
      setError('Pick a product for the link');
      return;
    }
    if (form.linkType === 'url' && !form.linkUrl.trim()) {
      setError('Enter a URL for the link');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        order: Number(form.order) || 0,
        badgeText: form.badgeText || null,
        subtitle: form.subtitle || null,
        productId: form.linkType === 'product' ? form.productId : null,
        linkUrl: form.linkType === 'url' ? form.linkUrl : null,
        priceText: form.priceText || null,
        imageUrl: form.imageUrl || null,
        borderStyle: form.animatedBorder ? form.borderStyle || null : null,
      };
      if (editing) {
        await api.updateHomeCard(editing.id, payload);
      } else {
        await api.createHomeCard(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      await api.deleteHomeCard(id);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const toggleEnabled = async (card: any) => {
    try {
      await api.updateHomeCard(card.id, { enabled: !card.enabled });
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const iconFor = (name?: string | null) =>
    (ICON_OPTIONS.find((o) => o.value === (name || '').toLowerCase()) || ICON_OPTIONS[0]).Icon;

  const linkLabel = (card: any) => {
    if (card.linkType === 'product') {
      const p = products.find((x) => x.id === card.productId);
      return `Product: ${p?.name || card.productId?.slice(0, 8) || '?'}`;
    }
    if (card.linkType === 'url') return card.linkUrl;
    return 'No link';
  };

  return (
    <div className="min-h-screen">
      <AdminNavbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between fade-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <Layers className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">Home Cards</h1>
              <p className="text-[10px] text-slate-500 font-semibold">
                Hero & promo blocks at the top of the storefront
              </p>
            </div>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black">
            <Plus className="w-4 h-4 stroke-[3]" />
            New card
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
          </div>
        ) : cards.length === 0 ? (
          <div className="glass rounded-3xl py-14 text-center space-y-2 fade-up">
            <Package className="w-9 h-9 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-400">No cards — the storefront shows its built-in hero.</p>
            <p className="text-[11px] text-slate-500">Add one to take control of the home page top.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card, i) => {
              const Icon = iconFor(card.icon);
              return (
                <div key={card.id} className="glass rounded-2xl p-4 flex items-center gap-3 fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    card.kind === 'promo'
                      ? 'bg-emerald-500/15 border border-emerald-500/25'
                      : 'bg-amber-500/15 border border-amber-500/25'
                  }`}>
                    <Icon className={`w-5 h-5 ${card.kind === 'promo' ? 'text-emerald-300' : 'text-amber-300'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-black text-slate-100 truncate">{card.title}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                        card.kind === 'promo'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                      }`}>
                        {card.kind}
                      </span>
                      {card.animatedBorder && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/25">
                          animated border
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-slate-500">#{card.order}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold mt-0.5">
                      <MousePointerClick className="w-3 h-3" />
                      <span className="truncate">{linkLabel(card)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleEnabled(card)}
                    className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${
                      card.enabled ? 'bg-emerald-500/80' : 'bg-slate-600/60'
                    }`}
                    title={card.enabled ? 'Visible on storefront' : 'Hidden'}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${card.enabled ? 'left-5' : 'left-1'}`} />
                  </button>

                  <button onClick={() => openEdit(card)} className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 shrink-0" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(card.id)}
                    disabled={deleting === card.id}
                    className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-rose-400 shrink-0"
                    title="Delete"
                  >
                    {deleting === card.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* EDITOR MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="glass rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#070b14]/95" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-black text-slate-100">{editing ? 'Edit card' : 'New card'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Type</span>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value })}
                    className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                  >
                    <option value="hero">Hero (big)</option>
                    <option value="promo">Promo (compact)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Order</span>
                  <input
                    type="number"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: e.target.value })}
                    className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Title *</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Premium Digital Keys"
                  className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pill / badge text</span>
                  <input
                    value={form.badgeText}
                    onChange={(e) => setForm({ ...form, badgeText: e.target.value })}
                    placeholder="Original • Instant"
                    className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Icon</span>
                  <select
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                  >
                    {ICON_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Subtitle</span>
                <input
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  placeholder="Instant delivery • Secure — Chapa"
                  className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Price text (optional)</span>
                <input
                  value={form.priceText}
                  onChange={(e) => setForm({ ...form, priceText: e.target.value })}
                  placeholder="e.g. 1,500 ETB"
                  className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                />
                <span className="block text-[10px] text-slate-500">
                  Shown big on Gemini-border cards. Cards linked to a product auto-show that product's price instead.
                </span>
              </label>

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Card art (image)</span>
                {form.imageUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="Card art" className="w-full h-28 object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: '' })}
                      className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[10px] font-black hover:bg-black/90"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-[11px] font-bold text-slate-400 cursor-pointer hover:bg-white/5 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <ImagePlus className="w-4 h-4" />
                    {uploading ? 'Uploading…' : 'Upload new'}
                    <input type="file" accept="image/*" className="hidden" onChange={pickImage} disabled={uploading} />
                  </label>
                  <button
                    type="button"
                    onClick={openLibrary}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-[11px] font-bold text-slate-300 hover:bg-white/5"
                  >
                    <Images className="w-4 h-4" />
                    Library
                  </button>
                </div>
                <span className="block text-[10px] text-slate-500">
                  Full-bleed artwork on Gemini-border cards. Stored on Cloudflare R2, served via CDN.
                </span>
              </div>

              <div className="space-y-2 rounded-2xl border border-white/5 bg-white/[0.02] p-3.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" />
                  When clicked
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'none', label: 'Nothing' },
                    { value: 'product', label: 'Product page' },
                    { value: 'url', label: 'Custom link' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, linkType: opt.value })}
                      className={`px-2 py-2 rounded-xl text-[11px] font-black border transition-colors ${
                        form.linkType === opt.value
                          ? 'bg-amber-400/15 text-amber-300 border-amber-500/30'
                          : 'text-slate-400 border-white/10 hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {form.linkType === 'product' && (
                  <select
                    value={form.productId}
                    onChange={(e) => setForm({ ...form, productId: e.target.value })}
                    className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                  >
                    <option value="">Pick a product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.stock > 0 ? '' : '(out of stock)'}
                      </option>
                    ))}
                  </select>
                )}

                {form.linkType === 'url' && (
                  <input
                    value={form.linkUrl}
                    onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                    placeholder="/affiliate or https://…"
                    className="input-dark w-full rounded-xl px-3 py-2.5 text-[12px] text-slate-100"
                  />
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, animatedBorder: !form.animatedBorder })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-black transition-colors ${
                    form.animatedBorder
                      ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                      : 'text-slate-400 border-white/10 hover:bg-white/5'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Gemini border {form.animatedBorder ? 'ON' : 'OFF'}
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-black transition-colors ${
                    form.enabled
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'text-slate-400 border-white/10 hover:bg-white/5'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {form.enabled ? 'Visible' : 'Hidden'}
                </button>
              </div>

              {form.animatedBorder && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Border style</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: '', label: 'Gemini colors' },
                      { value: 'blue', label: 'Blue' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm({ ...form, borderStyle: opt.value })}
                        className={`px-2 py-2 rounded-xl text-[11px] font-black border transition-colors ${
                          form.borderStyle === opt.value
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            : 'text-slate-400 border-white/10 hover:bg-white/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-semibold">
                  {error}
                </div>
              )}

              <button
                onClick={save}
                disabled={saving}
                className="btn-primary w-full py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                {editing ? 'Save changes' : 'Create card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── R2 library picker — previous card uploads from the bucket ── */}
      {libraryOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setLibraryOpen(false)}>
          <div className="glass rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col bg-[#070b14]/95" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div>
                <h2 className="text-sm font-black text-slate-100">Card art library</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">Previous uploads from your Cloudflare R2 bucket · newest first</p>
              </div>
              <button onClick={() => setLibraryOpen(false)} className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {libraryLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : library.length === 0 ? (
                <div className="py-10 text-center text-[11px] font-semibold text-slate-500">
                  No uploads yet — upload your first image and it will appear here.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {library.map((img) => {
                    const selected = form.imageUrl === img.url;
                    return (
                      <button
                        key={img.key}
                        type="button"
                        onClick={() => { setForm({ ...form, imageUrl: img.url }); setLibraryOpen(false); }}
                        className={`relative rounded-xl overflow-hidden border transition-all group ${
                          selected
                            ? 'border-sky-400 ring-2 ring-sky-400/50'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.key} loading="lazy" className="w-full h-24 object-cover" />
                        {selected && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                        <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-black/60 text-[8px] font-bold text-slate-300 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {img.key.split('/').pop()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
