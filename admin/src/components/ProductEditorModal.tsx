'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Image as ImageIcon,
  Languages,
  ListChecks,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import R2ImagePicker from './R2ImagePicker';

type LangCode = 'en' | 'am';
type EditorTab = 'details' | 'media' | 'pricing' | 'languages' | 'keys';

type TranslationRow = {
  name: string;
  shortDesc: string;
  description: string;
  features: string[];
  requirements: string[];
  activationSteps: string[];
};

type TranslationMap = Record<LangCode, TranslationRow>;

const LANGUAGES: { code: LangCode; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'EN' },
  { code: 'am', label: 'Amharic', native: 'አማ' },
];

const emptyTranslation = (): TranslationRow => ({
  name: '',
  shortDesc: '',
  description: '',
  features: [],
  requirements: [],
  activationSteps: [],
});

const emptyTranslations = (): TranslationMap => ({
  en: emptyTranslation(),
  am: emptyTranslation(),
});

const splitLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const joinLines = (value?: string[]) => (Array.isArray(value) ? value.join('\n') : '');

const uniqueUrls = (urls: string[]) => Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));

const normalizeTranslations = (raw: any): TranslationMap => {
  const normalized = emptyTranslations();
  LANGUAGES.forEach(({ code }) => {
    const row = raw?.[code] || {};
    normalized[code] = {
      name: row.name || '',
      shortDesc: row.shortDesc || '',
      description: row.description || '',
      features: Array.isArray(row.features) ? row.features : [],
      requirements: Array.isArray(row.requirements) ? row.requirements : [],
      activationSteps: Array.isArray(row.activationSteps) ? row.activationSteps : [],
    };
  });
  return normalized;
};

const initialForm = {
  name: '',
  shortDesc: '',
  description: '',
  price: '500',
  originalPrice: '',
  currency: 'ETB',
  badge: 'NEW',
  bannerUrl: '',
  categoryId: '',
  featuresStr: 'Original digital product\nInstant delivery',
  requirementsStr: 'Internet connection required',
  activationStepsStr: 'Open the delivered license or account details\nUse it on the official website or app',
  downloadUrl: '',
  priceMode: 'MANUAL',
  costUSD: '',
  marginMultiplier: '',
  discountPct: '0',
  initialKeysStr: '',
};

export default function ProductEditorModal({
  product,
  categories,
  settings,
  onClose,
  onSaved,
}: {
  product?: any | null;
  categories: any[];
  settings: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product?.id;
  const [activeTab, setActiveTab] = useState<EditorTab>('details');
  const [form, setForm] = useState(initialForm);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [translations, setTranslations] = useState<TranslationMap>(emptyTranslations());
  const [activeLang, setActiveLang] = useState<LangCode>('am');
  const [translationStatus, setTranslationStatus] = useState<any>(null);
  const [translating, setTranslating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTranslationStatus().then(setTranslationStatus).catch(() => setTranslationStatus({ configured: false }));
  }, []);

  useEffect(() => {
    const base = {
      ...initialForm,
      categoryId: categories[0]?.id || '',
    };
    if (!product) {
      setForm(base);
      setGalleryUrls([]);
      setTranslations(emptyTranslations());
      return;
    }

    setForm({
      ...base,
      name: product.name || '',
      shortDesc: product.shortDesc || '',
      description: product.description || '',
      price: String(product.originalPrice || product.price || ''),
      originalPrice: product.originalPrice ? String(product.originalPrice) : '',
      currency: product.currency || 'ETB',
      badge: product.badge || '',
      bannerUrl: product.bannerUrl || '',
      categoryId: product.categoryId || product.category?.id || categories[0]?.id || '',
      featuresStr: joinLines(product.features),
      requirementsStr: joinLines(product.requirements),
      activationStepsStr: joinLines(product.activationGuide?.steps),
      downloadUrl: product.activationGuide?.downloadUrl || '',
      priceMode: product.priceMode || 'MANUAL',
      costUSD: product.costUSD != null ? String(product.costUSD) : '',
      marginMultiplier: product.marginMultiplier != null ? String(product.marginMultiplier) : '',
      discountPct: String(product.discountPct || 0),
      initialKeysStr: '',
    });
    setGalleryUrls(uniqueUrls(product.gallery || []));
    setTranslations(normalizeTranslations(product.translations));
  }, [product, categories]);

  const pricingPreview = useMemo(() => {
    const rate = Number(settings?.usdToEtb) || 200;
    const globalMargin = Number(settings?.marginMultiplier) || 3;
    const globalDiscount = Number(settings?.globalDiscountPct) || 0;
    const productDiscount = Number(form.discountPct) || 0;
    const discount = Math.min(95, globalDiscount + productDiscount);

    let base = Number(form.price) || 0;
    if (form.priceMode === 'AUTO') {
      const cost = Number(form.costUSD) || 0;
      const margin = Number(form.marginMultiplier) || globalMargin;
      base = Math.round(cost * rate * margin);
    }

    const final = Math.max(1, Math.round(base * (1 - discount / 100)));
    return { base, final, discount };
  }, [form.price, form.priceMode, form.costUSD, form.marginMultiplier, form.discountPct, settings]);

  const allImages = useMemo(
    () => uniqueUrls([form.bannerUrl, ...galleryUrls]),
    [form.bannerUrl, galleryUrls],
  );

  const translatedLanguageCount = useMemo(
    () =>
      LANGUAGES.filter(({ code }) => {
        const row = translations[code];
        return row.name || row.shortDesc || row.description;
      }).length,
    [translations],
  );

  const updateForm = (key: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTranslation = (lang: LangCode, key: keyof TranslationRow, value: string | string[]) => {
    setTranslations((current) => ({
      ...current,
      [lang]: {
        ...current[lang],
        [key]: value,
      },
    }));
  };

  const addImage = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    setGalleryUrls((current) => uniqueUrls([...current, url]));
    if (!form.bannerUrl) updateForm('bannerUrl', url);
    setNewImageUrl('');
  };

  /** Add a CDN URL from the R2 picker (upload or library) to the gallery. */
  const addImageUrl = (url: string) => {
    setGalleryUrls((current) => uniqueUrls([...current, url]));
    if (!form.bannerUrl) updateForm('bannerUrl', url);
  };

  const removeImage = (url: string) => {
    const remaining = allImages.filter((item) => item !== url);
    setGalleryUrls(remaining.filter((item) => item !== form.bannerUrl));
    if (form.bannerUrl === url) updateForm('bannerUrl', remaining[0] || '');
  };

  const makeMainImage = (url: string) => {
    updateForm('bannerUrl', url);
    setGalleryUrls((current) => uniqueUrls([url, ...current]));
  };

  const handleTranslate = async () => {
    try {
      setTranslating(true);
      setError('');
      const result = await api.translateProduct({
        name: form.name,
        shortDesc: form.shortDesc,
        description: form.description,
        features: splitLines(form.featuresStr),
        requirements: splitLines(form.requirementsStr),
        activationSteps: splitLines(form.activationStepsStr),
      });
      setTranslations(normalizeTranslations(result));
      setActiveLang('am');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Translation failed');
    } finally {
      setTranslating(false);
    }
  };

  const buildPayload = () => {
    const gallery = uniqueUrls([form.bannerUrl, ...galleryUrls]);
    const basePrice = Number(form.price) || pricingPreview.base || 1;
    const original = form.originalPrice
      ? Number(form.originalPrice)
      : pricingPreview.discount > 0
        ? pricingPreview.base
        : null;

    return {
      name: form.name.trim(),
      shortDesc: form.shortDesc.trim(),
      description: form.description.trim(),
      price: form.priceMode === 'AUTO' ? pricingPreview.base : basePrice,
      originalPrice: original,
      currency: form.currency,
      badge: form.badge.trim() || null,
      bannerUrl: form.bannerUrl.trim(),
      gallery,
      categoryId: form.categoryId,
      features: splitLines(form.featuresStr),
      requirements: splitLines(form.requirementsStr),
      translations,
      priceMode: form.priceMode,
      costUSD: form.costUSD ? Number(form.costUSD) : null,
      marginMultiplier: form.marginMultiplier ? Number(form.marginMultiplier) : null,
      discountPct: Number(form.discountPct) || 0,
      activationGuide: {
        steps: splitLines(form.activationStepsStr),
        downloadUrl: form.downloadUrl.trim() || undefined,
      },
      initialKeys: splitLines(form.initialKeysStr),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      const payload = buildPayload();
      if (isEdit) {
        await api.updateProduct(product.id, payload);
        const productDiscount = Number(form.discountPct) || 0;
        if (form.priceMode === 'AUTO' || productDiscount > 0) {
          await api.updateProductPricing(product.id, {
            priceMode: form.priceMode,
            costUSD: form.costUSD ? Number(form.costUSD) : null,
            marginMultiplier: form.marginMultiplier ? Number(form.marginMultiplier) : null,
            discountPct: productDiscount,
            manualPrice: form.priceMode === 'MANUAL' ? Number(form.price) : undefined,
          });
        }
      } else {
        await api.createProduct(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Product save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: EditorTab; label: string; icon: any; complete?: boolean }[] = [
    { id: 'details', label: 'Details', icon: Package, complete: !!form.name && !!form.shortDesc },
    { id: 'media', label: 'Media', icon: ImageIcon, complete: !!form.bannerUrl },
    { id: 'pricing', label: 'Pricing', icon: Settings2, complete: pricingPreview.final > 0 },
    { id: 'languages', label: 'AI Languages', icon: Languages, complete: translatedLanguageCount >= 2 },
    { id: 'keys', label: isEdit ? 'Key Pool' : 'Initial Keys', icon: ListChecks, complete: !isEdit && !!form.initialKeysStr.trim() },
  ];

  const lang = translations[activeLang];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md overflow-y-auto p-3 sm:p-5">
      <form
        onSubmit={handleSubmit}
        className="glass rounded-3xl w-full max-w-6xl mx-auto overflow-hidden fade-up"
      >
        <div className="sticky top-0 z-10 bg-[#070b14]/95 backdrop-blur-xl border-b border-white/10 px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              {isEdit ? `Edit — ${product.name}` : 'New Product Studio'}
            </h2>
            <p className="text-[10px] text-slate-500">
              Content, media, pricing, and storefront languages in one flow.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] min-h-[70vh]">
          {/* Live storefront preview */}
          <aside className="border-b lg:border-b-0 lg:border-r border-white/10 bg-white/[0.02] p-5 space-y-4">
            <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#070b14]">
              <div className="relative h-44 bg-slate-900">
                {form.bannerUrl ? (
                  <img src={form.bannerUrl} alt={form.name || 'Product'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-[10px] font-bold">Add a main image</span>
                  </div>
                )}
                {form.badge && (
                  <span className="absolute top-3 left-3 px-2 py-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black uppercase">
                    {form.badge}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-400/80 font-black">
                    {categories.find((c) => c.id === form.categoryId)?.name || 'Category'}
                  </div>
                  <h3 className="text-sm font-black text-white line-clamp-2 min-h-[2.2rem]">
                    {form.name || 'Product title preview'}
                  </h3>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{form.shortDesc || 'Short storefront description appears here.'}</p>
                </div>
                <div className="flex items-end justify-between border-t border-white/5 pt-3">
                  <div>
                    {pricingPreview.discount > 0 && (
                      <div className="text-[9px] text-slate-600 line-through">{pricingPreview.base.toLocaleString()} ETB</div>
                    )}
                    <div className="text-lg font-black text-gradient">{pricingPreview.final.toLocaleString()} ETB</div>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[9px] font-black">
                    {translatedLanguageCount}/2 languages
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[11px] font-black border transition-all ${
                      active
                        ? 'bg-amber-400/15 border-amber-500/40 text-amber-300'
                        : 'bg-white/[0.03] border-white/5 text-slate-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </span>
                    {tab.complete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main editor */}
          <section className="p-5 sm:p-6 space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-bold">
                {error}
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-4 fade-up">
                <SectionTitle title="Product details" subtitle="This is the base content DeepSeek uses for localization." />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Title">
                    <input
                      required
                      value={form.name}
                      onChange={(e) => updateForm('name', e.target.value)}
                      placeholder="ChatGPT Plus — 1 Month"
                      className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      value={form.categoryId}
                      onChange={(e) => updateForm('categoryId', e.target.value)}
                      className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Short description">
                  <input
                    required
                    value={form.shortDesc}
                    onChange={(e) => updateForm('shortDesc', e.target.value)}
                    placeholder="Instant premium access with full support"
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                  />
                </Field>

                <Field label="Full description">
                  <textarea
                    required
                    rows={4}
                    value={form.description}
                    onChange={(e) => updateForm('description', e.target.value)}
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Features — one per line">
                    <textarea
                      rows={4}
                      value={form.featuresStr}
                      onChange={(e) => updateForm('featuresStr', e.target.value)}
                      className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                    />
                  </Field>
                  <Field label="Requirements — one per line">
                    <textarea
                      rows={4}
                      value={form.requirementsStr}
                      onChange={(e) => updateForm('requirementsStr', e.target.value)}
                      className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Badge">
                    <input
                      value={form.badge}
                      onChange={(e) => updateForm('badge', e.target.value)}
                      placeholder="NEW, HOT, LIMITED"
                      className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                    />
                  </Field>
                  <Field label="Download URL (optional)">
                    <input
                      value={form.downloadUrl}
                      onChange={(e) => updateForm('downloadUrl', e.target.value)}
                      placeholder="https://…"
                      className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                    />
                  </Field>
                </div>

                <Field label="Activation steps — one per line">
                  <textarea
                    rows={4}
                    value={form.activationStepsStr}
                    onChange={(e) => updateForm('activationStepsStr', e.target.value)}
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                  />
                </Field>
              </div>
            )}

            {activeTab === 'media' && (
              <div className="space-y-4 fade-up">
                <SectionTitle title="Media library" subtitle="Choose one main storefront image and add related images for the product gallery." />
                <Field label="Main image URL">
                  <input
                    required
                    value={form.bannerUrl}
                    onChange={(e) => updateForm('bannerUrl', e.target.value)}
                    placeholder="https://images…"
                    className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100"
                  />
                </Field>

                <R2ImagePicker folder="products" onAdd={addImageUrl} />

                <div className="flex gap-2">
                  <input
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="…or paste an image URL manually"
                    className="flex-1 input-dark rounded-xl px-3 py-2.5 text-slate-100"
                  />
                  <button type="button" onClick={addImage} className="btn-primary px-4 rounded-xl text-[11px] font-black flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    Add
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {allImages.map((url) => {
                    const main = url === form.bannerUrl;
                    return (
                      <div key={url} className={`rounded-2xl overflow-hidden border ${main ? 'border-amber-400/60' : 'border-white/10'} bg-white/[0.03]`}>
                        <div className="h-28 bg-slate-900">
                          <img src={url} alt="Product" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => makeMainImage(url)}
                            className={`flex-1 px-2 py-1.5 rounded-lg text-[9px] font-black ${main ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
                          >
                            {main ? 'MAIN' : 'MAKE MAIN'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeImage(url)}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'pricing' && (
              <div className="space-y-4 fade-up">
                <SectionTitle title="Pricing control" subtitle="Use supplier economics automatically or lock a manual ETB price." />
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'AUTO', label: 'Auto from cost' },
                    { id: 'MANUAL', label: 'Manual price' },
                  ].map((mode) => (
                    <button
                      type="button"
                      key={mode.id}
                      onClick={() => updateForm('priceMode', mode.id)}
                      className={`py-3 rounded-2xl font-black text-[11px] border ${
                        form.priceMode === mode.id
                          ? 'bg-amber-400/15 border-amber-500/40 text-amber-300'
                          : 'bg-white/[0.03] border-white/10 text-slate-400'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {form.priceMode === 'AUTO' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Cost USD">
                      <input type="number" step="0.01" value={form.costUSD} onChange={(e) => updateForm('costUSD', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-sky-300 font-mono" />
                    </Field>
                    <Field label={`Margin × (global ${settings?.marginMultiplier || 3})`}>
                      <input type="number" step="0.1" value={form.marginMultiplier} onChange={(e) => updateForm('marginMultiplier', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
                    </Field>
                    <Field label="Product discount %">
                      <input type="number" min="0" max="95" value={form.discountPct} onChange={(e) => updateForm('discountPct', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-rose-300" />
                    </Field>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Manual price ETB">
                      <input required type="number" min="1" value={form.price} onChange={(e) => updateForm('price', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-amber-300 font-black" />
                    </Field>
                    <Field label="Original/compare ETB">
                      <input type="number" min="0" value={form.originalPrice} onChange={(e) => updateForm('originalPrice', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
                    </Field>
                    <Field label="Product discount %">
                      <input type="number" min="0" max="95" value={form.discountPct} onChange={(e) => updateForm('discountPct', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-rose-300" />
                    </Field>
                  </div>
                )}

                <div className="rounded-3xl bg-amber-400/10 border border-amber-500/25 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Storefront price preview</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    {pricingPreview.discount > 0 && (
                      <span className="text-[11px] text-slate-500 line-through">{pricingPreview.base.toLocaleString()} ETB</span>
                    )}
                    <span className="text-2xl font-black text-gradient">{pricingPreview.final.toLocaleString()} ETB</span>
                    {pricingPreview.discount > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-rose-500 text-white text-[9px] font-black">-{pricingPreview.discount}%</span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Rate {settings?.usdToEtb || 200} ETB/USD · global discount {settings?.globalDiscountPct || 0}% included.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'languages' && (
              <div className="space-y-4 fade-up">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle title="Storefront languages" subtitle="Generate with DeepSeek, then fine-tune every language before saving." />
                  <button
                    type="button"
                    onClick={handleTranslate}
                    disabled={translating || !translationStatus?.configured || !form.name || !form.shortDesc || !form.description}
                    className="btn-primary px-4 py-2.5 rounded-xl text-[11px] font-black flex items-center gap-2"
                  >
                    {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                    {translating ? 'Translating…' : 'Generate 2 languages'}
                  </button>
                </div>

                <div className={`rounded-2xl border px-4 py-3 text-[11px] font-bold ${
                  translationStatus?.configured
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                }`}>
                  {translationStatus?.configured
                    ? `DeepSeek ready · ${translationStatus.model}`
                    : 'DeepSeek key is not configured on the backend.'}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {LANGUAGES.map((language) => {
                    const row = translations[language.code];
                    const complete = row.name && row.shortDesc && row.description;
                    return (
                      <button
                        type="button"
                        key={language.code}
                        onClick={() => setActiveLang(language.code)}
                        className={`px-3 py-2 rounded-xl border text-[10px] font-black whitespace-nowrap ${
                          activeLang === language.code
                            ? 'bg-amber-400/15 border-amber-500/40 text-amber-300'
                            : 'bg-white/[0.03] border-white/10 text-slate-400'
                        }`}
                      >
                        {language.native} {complete && '✓'}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="text-[11px] font-black text-white">
                    {LANGUAGES.find((language) => language.code === activeLang)?.label}
                  </div>
                  <Field label="Translated title">
                    <input value={lang.name} onChange={(e) => updateTranslation(activeLang, 'name', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
                  </Field>
                  <Field label="Translated short description">
                    <input value={lang.shortDesc} onChange={(e) => updateTranslation(activeLang, 'shortDesc', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
                  </Field>
                  <Field label="Translated full description">
                    <textarea rows={3} value={lang.description} onChange={(e) => updateTranslation(activeLang, 'description', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Features">
                      <textarea rows={4} value={joinLines(lang.features)} onChange={(e) => updateTranslation(activeLang, 'features', splitLines(e.target.value))} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                    </Field>
                    <Field label="Requirements">
                      <textarea rows={4} value={joinLines(lang.requirements)} onChange={(e) => updateTranslation(activeLang, 'requirements', splitLines(e.target.value))} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                    </Field>
                    <Field label="Activation steps">
                      <textarea rows={4} value={joinLines(lang.activationSteps)} onChange={(e) => updateTranslation(activeLang, 'activationSteps', splitLines(e.target.value))} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'keys' && (
              <div className="space-y-4 fade-up">
                <SectionTitle
                  title={isEdit ? 'Existing key pool' : 'Initial license keys'}
                  subtitle={isEdit ? 'Use the Keys button on the product card to add stock to an existing product.' : 'Paste one license key per line. Stock is created automatically.'}
                />
                {isEdit ? (
                  <div className="rounded-2xl bg-sky-500/10 border border-sky-500/25 p-4 text-sky-300 text-[11px] font-bold">
                    Save content here, then open “Keys” from the product card to manage stock.
                  </div>
                ) : (
                  <Field label="License keys — one per line">
                    <textarea rows={8} value={form.initialKeysStr} onChange={(e) => updateForm('initialKeysStr', e.target.value)} placeholder={'KEY-AAAA-1111\nKEY-BBBB-2222'} className="w-full input-dark rounded-xl px-3 py-2.5 text-amber-300 font-mono" />
                  </Field>
                )}
              </div>
            )}

            <div className="sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4 bg-[#070b14]/95 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="text-[10px] text-slate-500 font-bold">
                {allImages.length} images · {translatedLanguageCount}/2 languages · {pricingPreview.final.toLocaleString()} ETB
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="btn-ghost px-4 py-2.5 rounded-xl text-[11px] font-black text-slate-300">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary px-5 py-2.5 rounded-xl text-[11px] font-black flex items-center gap-2">
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isEdit ? 'Save product' : 'Create product'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-black text-white">{title}</h3>
      <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-slate-400 font-bold mb-1.5 text-[10px] uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
