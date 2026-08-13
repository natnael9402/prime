'use client';

import React, { useState } from 'react';
import {
  X, Copy, Check, MessageCircle, Key, CreditCard, HandCoins, AlertTriangle, Clock,
} from 'lucide-react';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-[12px] font-semibold text-slate-200 text-right min-w-0 break-words">
        {children}
      </span>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-400',
    sky: 'bg-sky-500/15 text-sky-300',
    violet: 'bg-violet-500/15 text-violet-300',
    slate: 'bg-slate-500/15 text-slate-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full font-black text-[9px] uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default function OrderDetailsModal({ order, onClose }: { order: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!order) return null;

  const o = order;
  const chatUrl = o.telegramUsername
    ? `https://t.me/${o.telegramUsername}`
    : o.telegramUserId
    ? `tg://openmessage?user_id=${o.telegramUserId}`
    : null;

  const copyKeys = () => {
    if (!o.licenseKey) return;
    navigator.clipboard.writeText(o.licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const fmtTime = (d: string) =>
    `${new Date(d).toLocaleDateString()} ${new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div className="relative w-full sm:max-w-lg glass rounded-t-3xl sm:rounded-3xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 fade-up">
        <div className="w-10 h-1 rounded-full bg-white/15 mx-auto sm:hidden" />

        {/* Header — product + status */}
        <div className="flex items-start gap-3 border-b border-white/5 pb-4">
          {o.product?.bannerUrl && (
            <img
              src={o.product.bannerUrl}
              alt={o.product?.name}
              className="w-14 h-14 rounded-xl object-cover border border-white/10 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-white leading-snug">{o.product?.name || 'Product'}</h2>
            <div className="font-mono text-[10px] text-amber-400 mt-0.5 break-all">{o.txRef}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <button onClick={onClose} className="text-slate-500 hover:text-white -mt-1">
              <X className="w-5 h-5" />
            </button>
            <Badge tone={o.status === 'PAID' ? 'green' : 'amber'}>{o.status}</Badge>
          </div>
        </div>

        {/* Customer */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/5 px-3.5">
          <Row label="Customer">
            {chatUrl ? (
              <a
                href={chatUrl}
                {...(chatUrl.startsWith('tg://') ? {} : { target: '_blank', rel: 'noreferrer' })}
                className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 hover:underline font-bold"
              >
                {o.customerName}
                <MessageCircle className="w-3 h-3 shrink-0" />
              </a>
            ) : (
              o.customerName
            )}
          </Row>
          <Row label="Email"><span className="break-all">{o.customerEmail}</span></Row>
          {o.customerPhone && <Row label="Phone">{o.customerPhone}</Row>}
          {o.telegramUsername && <Row label="Telegram"><span className="text-sky-400">@{o.telegramUsername}</span></Row>}
          {o.telegramUserId && <Row label="TG ID"><span className="font-mono text-[11px]">{o.telegramUserId}</span></Row>}
        </div>

        {/* Payment */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/5 px-3.5">
          <Row label="Amount">
            <span className="font-black text-emerald-400 text-sm">
              {o.amount.toLocaleString()} {o.currency}
            </span>
            <span className="text-slate-500 font-normal"> × {o.quantity || 1}</span>
          </Row>
          <Row label="Mode">
            <Badge tone={o.paymentMode === 'live' ? 'green' : 'violet'}>{o.paymentMode || 'mock'}</Badge>
          </Row>
          {o.chapaTxRef && <Row label="Chapa ref"><span className="font-mono text-[11px] break-all">{o.chapaTxRef}</span></Row>}
          {o.refCode && (
            <Row label="Referral">
              <Badge tone="rose">{o.refCode}</Badge>
              {o.commissionAmount != null && (
                <span className="block text-[10px] text-pink-300 mt-0.5">
                  <HandCoins className="w-3 h-3 inline -mt-0.5" /> {o.commissionAmount.toLocaleString()} {o.currency} commission
                </span>
              )}
            </Row>
          )}
        </div>

        {/* License keys */}
        {o.licenseKey && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> Delivered key{(o.licenseKey || '').includes('\n') ? 's' : ''}
              </span>
              <button
                onClick={copyKeys}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                  copied ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-slate-300 hover:text-white'
                }`}
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="font-mono text-[11px] text-sky-200 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
              {o.licenseKey}
            </pre>
          </div>
        )}

        {/* Fulfillment */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/5 px-3.5">
          <Row label="Fulfillment">
            {o.fulfillmentStatus === 'DELIVERED' && <Badge tone="sky">Delivered</Badge>}
            {o.fulfillmentStatus === 'FAILED' && <Badge tone="rose">Failed</Badge>}
            {o.fulfillmentStatus === 'PENDING' && <Badge tone="amber">Sending…</Badge>}
            {(!o.fulfillmentStatus || o.fulfillmentStatus === 'NONE') && <Badge tone="slate">Local key</Badge>}
          </Row>
          {o.supplierOrderId && <Row label="Supplier order"><span className="font-mono text-[11px]">{o.supplierOrderId}</span></Row>}
          {o.fulfillmentError && (
            <div className="flex items-start gap-2 py-2 text-[11px] text-rose-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{o.fulfillmentError}</span>
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-semibold pt-1">
          <Clock className="w-3 h-3" />
          Sold {fmtTime(o.createdAt)}
          {o.updatedAt !== o.createdAt && <span>· updated {fmtTime(o.updatedAt)}</span>}
        </div>
      </div>
    </div>
  );
}
