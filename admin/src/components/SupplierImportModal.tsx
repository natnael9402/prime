'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import R2ImagePicker from './R2ImagePicker';

type LangCode = 'en' | 'am';

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

const emptyRow = (): TranslationRow => ({
  name: '',
  shortDesc: '',
  description: '',
  features: [],
  requirements: [],
  activationSteps: [],
});

const emptyTranslations = (): TranslationMap => ({
  en: emptyRow(),
  am: emptyRow(),
});

const splitLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
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

export default function SupplierImportModal({
  supplierProduct,
  categories,
  settings,
  defaultCategoryId,
  defaultMargin,
  defaultDiscount,
  onClose,
  onImported,
}: {
  supplierProduct: any;
  categories: any[];
  settings: any;
  defaultCategoryId: string;
  defaultMargin?: string;
  defaultDiscount?: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}) {
  const supplierCost = Number(supplierProduct.priceUSD ?? supplierProduct.price_usdt ?? 0) || 0;
  const supplierImage = supplierProduct.imageUrl || supplierProduct.image_url || supplierProduct.image || '';
  const [form, setForm] = useState({
    name: supplierProduct.name || '',
    categoryId: defaultCategoryId || categories[0]?.id || '',
    badge: 'NEW',
    bannerUrl: supplierImage,
    shortDesc: `${supplierProduct.name} — instant digital delivery`,
    description: `${supplierProduct.name}. Premium digital product with fast delivery. After your payment is confirmed, your license or account details arrive instantly.`,
    featuresStr: 'Original digital product\nInstant delivery after payment\nFull customer support',
    requirementsStr: 'Internet connection required',
    activationStepsStr: 'Open the delivered account or license key\nUse it on the official website or app',
    priceMode: 'AUTO',
    marginMultiplier: defaultMargin || '',
    discountPct: defaultDiscount || '0',
    manualPrice: String(supplierProduct.pricePreviewETB || ''),
    originalPrice: '',
  });
  const [galleryUrls, setGalleryUrls] = useState<string[]>(supplierImage ? [supplierImage] : []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [translations, setTranslations] = useState<TranslationMap>(emptyTranslations());
  const [activeLang, setActiveLang] = useState<LangCode>('am');
  const [translationStatus, setTranslationStatus] = useState<any>(null);
  const [translating, setTranslating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTranslationStatus().then(setTranslationStatus).catch(() => setTranslationStatus({ configured: false }));
  }, []);

  const pricingPreview = useMemo(() => {
    const rate = Number(settings?.usdToEtb) || 200;
    const globalMargin = Number(settings?.marginMultiplier) || 3;
    const discount = Math.min(95, (Number(settings?.globalDiscountPct) || 0) + (Number(form.discountPct) || 0));

    if (form.priceMode === 'MANUAL') {
      const manual = Number(form.manualPrice) || 0;
      return {
        base: manual,
        final: Math.max(1, Math.round(manual * (1 - discount / 100))),
        discount,
      };
    }

    const margin = Number(form.marginMultiplier) || globalMargin;
    const base = Math.round((Number(supplierCost) || 0) * rate * margin);
    return {
      base,
      final: Math.max(1, Math.round(base * (1 - discount / 100))),
      discount,
    };
  }, [form.priceMode, form.manualPrice, form.marginMultiplier, form.discountPct, settings, supplierCost]);

  const allImages = useMemo(() => uniqueUrls([form.bannerUrl, ...galleryUrls]), [form.bannerUrl, galleryUrls]);
  const translatedCount = useMemo(
    () => LANGUAGES.filter(({ code }) => translations[code].name || translations[code].shortDesc || translations[code].description).length,
    [translations],
  );
  const lang = translations[activeLang];

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTranslation = (code: LangCode, key: keyof TranslationRow, value: string | string[]) => {
    setTranslations((current) => ({
      ...current,
      [code]: { ...current[code], [key]: value },
    }));
  };

  const addImage = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    setGalleryUrls((current) => uniqueUrls([...current, url]));
    if (!form.bannerUrl) updateForm('bannerUrl', url);
    setNewImageUrl('');
  };

  const removeImage = (url: string) => {
    const remaining = allImages.filter((item) => item !== url);
    setGalleryUrls(remaining.filter((item) => item !== form.bannerUrl));
    if (form.bannerUrl === url) updateForm('bannerUrl', remaining[0] || '');
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
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Translation failed');
    } finally {
      setTranslating(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setImporting(true);
      setError('');
      await api.importSupplierProduct({
        supplier: supplierProduct.supplier,
        supplierProductId: String(supplierProduct.id),
        categoryId: form.categoryId,
        name: form.name.trim(),
        shortDesc: form.shortDesc.trim(),
        description: form.description.trim(),
        bannerUrl: form.bannerUrl.trim(),
        gallery: allImages,
        marginMultiplier: form.marginMultiplier ? Number(form.marginMultiplier) : undefined,
        discountPct: Number(form.discountPct) || 0,
        manualPrice: form.priceMode === 'MANUAL' ? Number(form.manualPrice) : undefined,
        originalPrice: form.originalPrice ? Number(form.originalPrice) : undefined,
        badge: form.badge.trim() || undefined,
        features: splitLines(form.featuresStr),
        requirements: splitLines(form.requirementsStr),
        activationSteps: splitLines(form.activationStepsStr),
        translations,
      });
      await onImported();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md overflow-y-auto p-3 sm:p-5">
      <form onSubmit={handleImport} className="glass rounded-3xl w-full max-w-6xl mx-auto overflow-hidden fade-up">
        <div className="sticky top-0 z-10 bg-[#070b14]/95 backdrop-blur-xl border-b border-white/10 px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Import Supplier Product
            </h2>
            <p className="text-[10px] text-slate-500 font-mono">{supplierProduct.slug}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr]">
          {/* Preview and media */}
          <aside className="border-b xl:border-b-0 xl:border-r border-white/10 bg-white/[0.02] p-5 space-y-4">
            <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#070b14]">
              <div className="relative h-48 bg-slate-900">
                {form.bannerUrl ? (
                  <img src={form.bannerUrl} alt={form.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-[10px] font-bold">Add main image</span>
                  </div>
                )}
                <span className="absolute top-3 left-3 px-2 py-1 rounded-full bg-sky-500 text-white text-[9px] font-black">
                  ${supplierProduct.supplierLabel || 'Supplier'} ${supplierCost}
                </span>
              </div>
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-black text-white line-clamp-2">{form.name}</h3>
                <p className="text-[11px] text-slate-500 line-clamp-2">{form.shortDesc}</p>
                <div className="flex items-end justify-between border-t border-white/5 pt-3">
                  <div>
                    {pricingPreview.discount > 0 && (
                      <div className="text-[9px] text-slate-600 line-through">{pricingPreview.base.toLocaleString()} ETB</div>
                    )}
                    <div className="text-lg font-black text-gradient">{pricingPreview.final.toLocaleString()} ETB</div>
                  </div>
                  <span className="text-[9px] font-black text-emerald-300">{translatedCount}/2 languages</span>
                </div>
              </div>
            </div>

            <R2ImagePicker
              folder="products"
              accent="sky"
              onAdd={(url) => {
                setGalleryUrls((current) => uniqueUrls([...current, url]));
                if (!form.bannerUrl) updateForm('bannerUrl', url);
              }}
            />

            <Field label="Main image URL">
              <input value={form.bannerUrl} onChange={(e) => updateForm('bannerUrl', e.target.value)} placeholder="https://…" className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
            </Field>
            <div className="flex gap-2">
              <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Related image URL…" className="flex-1 input-dark rounded-xl px-3 py-2.5 text-slate-100" />
              <button type="button" onClick={addImage} className="btn-primary px-3.5 rounded-xl text-[11px] font-black">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {allImages.map((url) => (
                <div key={url} className={`relative rounded-xl overflow-hidden border ${url === form.bannerUrl ? 'border-sky-400' : 'border-white/10'}`}>
                  <img src={url} alt="Gallery" className="w-full h-20 object-cover" />
                  <div className="absolute inset-x-1 bottom-1 flex gap-1">
                    <button type="button" onClick={() => updateForm('bannerUrl', url)} className={`flex-1 rounded px-1 py-0.5 text-[8px] font-black ${url === form.bannerUrl ? 'bg-sky-500 text-white' : 'bg-black/60 text-white'}`}>
                      {url === form.bannerUrl ? 'MAIN' : 'SET'}
                    </button>
                    <button type="button" onClick={() => removeImage(url)} className="rounded bg-rose-500/80 px-1 py-0.5 text-white">
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Editable import content */}
          <section className="p-5 sm:p-6 space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-bold">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Storefront title">
                <input required value={form.name} onChange={(e) => updateForm('name', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
              </Field>
              <Field label="Category">
                <select value={form.categoryId} onChange={(e) => updateForm('categoryId', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100">
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Short description">
              <input required value={form.shortDesc} onChange={(e) => updateForm('shortDesc', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
            </Field>
            <Field label="Full description">
              <textarea required rows={3} value={form.description} onChange={(e) => updateForm('description', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2.5 text-slate-100" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Features">
                <textarea rows={4} value={form.featuresStr} onChange={(e) => updateForm('featuresStr', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
              </Field>
              <Field label="Requirements">
                <textarea rows={4} value={form.requirementsStr} onChange={(e) => updateForm('requirementsStr', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
              </Field>
              <Field label="Activation steps">
                <textarea rows={4} value={form.activationStepsStr} onChange={(e) => updateForm('activationStepsStr', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
              </Field>
            </div>

            {/* Pricing */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-black text-white">Pricing</h3>
                <span className="text-[10px] text-slate-500">Cost ${supplierCost} USD</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'AUTO', label: 'Auto pricing' },
                  { id: 'MANUAL', label: 'Manual price' },
                ].map((mode) => (
                  <button type="button" key={mode.id} onClick={() => updateForm('priceMode', mode.id)} className={`py-2.5 rounded-xl border text-[10px] font-black ${form.priceMode === mode.id ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.03] border-white/10 text-slate-400'}`}>
                    {mode.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {form.priceMode === 'MANUAL' ? (
                  <Field label="Sell price ETB">
                    <input type="number" min="1" value={form.manualPrice} onChange={(e) => updateForm('manualPrice', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-amber-300 font-black" />
                  </Field>
                ) : (
                  <Field label={`Margin × (global ${settings?.marginMultiplier || 3})`}>
                    <input type="number" step="0.1" value={form.marginMultiplier} onChange={(e) => updateForm('marginMultiplier', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                  </Field>
                )}
                <Field label="Original ETB">
                  <input type="number" min="0" value={form.originalPrice} onChange={(e) => updateForm('originalPrice', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                </Field>
                <Field label="Discount %">
                  <input type="number" min="0" max="95" value={form.discountPct} onChange={(e) => updateForm('discountPct', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-rose-300" />
                </Field>
                <Field label="Badge">
                  <input value={form.badge} onChange={(e) => updateForm('badge', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                </Field>
              </div>
              <div className="rounded-2xl bg-amber-400/10 border border-amber-500/25 px-4 py-3 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Final storefront price</span>
                <span className="text-xl font-black text-gradient">{pricingPreview.final.toLocaleString()} ETB</span>
              </div>
            </div>

            {/* Translations */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[12px] font-black text-white">Storefront languages</h3>
                  <p className="text-[10px] text-slate-500">Generate, review, and edit before import.</p>
                </div>
                <button type="button" onClick={handleTranslate} disabled={translating || !translationStatus?.configured} className="btn-primary px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2">
                  {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  {translating ? 'Translating…' : 'Translate with DeepSeek'}
                </button>
              </div>
              <div className={`rounded-xl px-3 py-2 text-[10px] font-bold ${translationStatus?.configured ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                {translationStatus?.configured ? `DeepSeek ready · ${translationStatus.model}` : 'DeepSeek is not configured.'}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {LANGUAGES.map((language) => (
                  <button type="button" key={language.code} onClick={() => setActiveLang(language.code)} className={`px-3 py-2 rounded-xl border text-[10px] font-black whitespace-nowrap ${activeLang === language.code ? 'bg-sky-500/15 border-sky-500/40 text-sky-300' : 'bg-white/[0.03] border-white/10 text-slate-400'}`}>
                    {language.native} {translations[language.code].name && '✓'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={`${LANGUAGES.find((language) => language.code === activeLang)?.label} title`}>
                  <input value={lang.name} onChange={(e) => updateTranslation(activeLang, 'name', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                </Field>
                <Field label="Short description">
                  <input value={lang.shortDesc} onChange={(e) => updateTranslation(activeLang, 'shortDesc', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
                </Field>
              </div>
              <Field label="Full description">
                <textarea rows={3} value={lang.description} onChange={(e) => updateTranslation(activeLang, 'description', e.target.value)} className="w-full input-dark rounded-xl px-3 py-2 text-slate-100" />
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

            <div className="sticky bottom-0 -mx-5 sm:-mx-6 px-5 sm:px-6 py-4 bg-[#070b14]/95 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="text-[10px] text-slate-500 font-bold">
                {allImages.length} images · {translatedCount}/2 languages · {pricingPreview.final.toLocaleString()} ETB
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="btn-ghost px-4 py-2.5 rounded-xl text-[11px] font-black text-slate-300">
                  Cancel
                </button>
                <button type="submit" disabled={importing} className="btn-primary px-5 py-2.5 rounded-xl text-[11px] font-black flex items-center gap-2">
                  {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Import product
                </button>
              </div>
            </div>
          </section>
        </div>
      </form>
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
