'use client';

import React, { useEffect, useState } from 'react';
import { X, Check, RefreshCw, BadgeCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { triggerHaptic } from '@/lib/telegram';

type Method = 'telebirr' | 'cbe';

const METHODS: { id: Method; logo: string; name: string; hint: string }[] = [
  { id: 'telebirr', logo: '/payments/telebirr.svg', name: 'Telebirr', hint: '09XX XXX XXX' },
  { id: 'cbe', logo: '/payments/cbe-birr.svg', name: 'CBE Birr', hint: '1000XXXXXXXX' },
];

export default function PayoutModal({
  open,
  onClose,
  code,
  pendingAmount,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  pendingAmount: number;
  onSuccess: () => void;
}) {
  const t = useT();
  const [method, setMethod] = useState<Method | null>(null);
  const [account, setAccount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Reset state each time it opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setAccount('');
      setSubmitting(false);
      setError('');
      setDone(false);
    }
  }, [open]);

  if (!open) return null;

  const accountValid = (m: Method, v: string) => {
    const clean = v.replace(/[\s-]/g, '');
    return m === 'telebirr' ? /^(?:\+?251)?0?9\d{8}$/.test(clean) : /^\d{8,20}$/.test(clean);
  };

  const handleSubmit = async () => {
    if (!method || !accountValid(method, account)) return;
    triggerHaptic('heavy');
    setSubmitting(true);
    setError('');
    try {
      await api.requestPayout({ code, method, account: account.replace(/[\s-]/g, '') });
      setDone(true);
      triggerHaptic('medium');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-md bg-appsurface border-t sm:border border-apptext/10 rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-[slideUp_.25s_ease-out]">
        <div className="w-10 h-1 rounded-full bg-apptext/20 mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-black text-apptext">{t.requestPayout}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-apptext/5 flex items-center justify-center text-apptext-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          /* ---------- SUCCESS ---------- */
          <div className="py-6 text-center space-y-3 fade-up">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
              <BadgeCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div className="text-lg font-black text-apptext">{t.payoutSubmitted}</div>
            <div className="text-3xl font-black text-gradient">
              {pendingAmount.toLocaleString()}
              <span className="text-sm font-black text-apptext-3 ml-1">ETB</span>
            </div>
            <p className="text-[11px] text-apptext-3 font-semibold">{t.payoutSubmittedHint}</p>
            <button
              onClick={onClose}
              className="btn-primary w-full py-3 rounded-2xl text-sm font-black mt-2"
            >
              {t.continue}
            </button>
          </div>
        ) : !method ? (
          /* ---------- STEP 1: method picker ---------- */
          <div className="fade-up">
            <p className="text-[11px] text-apptext-3 font-semibold mb-3">
              {t.choosePayoutMethod}
              <span className="mx-1.5 text-apptext/30">·</span>
              <span className="text-emerald-400 font-black">
                {pendingAmount.toLocaleString()} ETB
              </span>
            </p>
            <div className="space-y-2.5">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    triggerHaptic('medium');
                    setMethod(m.id);
                  }}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-apptext/5 border border-apptext/10 active:scale-[.98] transition-all"
                >
                  <span className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 p-1.5">
                    <img src={m.logo} alt={m.name} className="max-w-full max-h-full object-contain" />
                  </span>
                  <span className="flex-1 text-left">
                    <span className="block text-sm font-black text-apptext">{m.name}</span>
                    <span className="block text-[10px] text-apptext-3 font-semibold mt-0.5">{m.hint}</span>
                  </span>
                  <Check className="w-4 h-4 text-apptext/20" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ---------- STEP 2: account input ---------- */
          <div className="fade-up">
            <button
              onClick={() => {
                setMethod(null);
                setError('');
              }}
              className="flex items-center gap-2 mb-3 text-[11px] font-bold text-apptext-2"
            >
              <span className="w-8 h-8 rounded-xl bg-white flex items-center justify-center p-1 shrink-0">
                <img
                  src={METHODS.find((m) => m.id === method)!.logo}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                />
              </span>
              {METHODS.find((m) => m.id === method)!.name}
              <span className="text-apptext/30">·</span>
              <span className="text-brand-300">{t.back}</span>
            </button>

            <label className="block text-[10px] font-black uppercase tracking-widest text-apptext-3 mb-1.5">
              {method === 'telebirr' ? t.telebirrPhone : t.cbeAccount}
            </label>
            <input
              type={method === 'telebirr' ? 'tel' : 'text'}
              inputMode="numeric"
              autoFocus
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={method === 'telebirr' ? '0912 345 678' : '1000123456789'}
              className="w-full px-4 py-3.5 rounded-2xl bg-apptext/5 border border-apptext/10 text-apptext text-base font-bold tracking-wider placeholder:text-apptext/25 placeholder:font-semibold focus:outline-none focus:border-brand-400/50"
            />

            <div className="mt-3 flex items-center justify-between px-1 text-[11px] font-bold">
              <span className="text-apptext-3">{t.youllReceive}</span>
              <span className="text-emerald-400 font-black">
                {pendingAmount.toLocaleString()} ETB
              </span>
            </div>

            {error && (
              <div className="mt-3 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-semibold">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !accountValid(method, account)}
              className="btn-primary w-full py-3.5 rounded-2xl text-sm font-black mt-4 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                t.submitRequest
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
