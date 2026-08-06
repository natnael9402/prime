'use client';

import React from 'react';
import {
  Check, Copy, ExternalLink, KeyRound, AlertTriangle, Mail, ShieldAlert, Link2,
} from 'lucide-react';
import { parseDelivery, buildGuide, DeliveryAccount, DeliveryField } from '@/lib/deliveryParser';
import type { Dict } from '@/lib/i18n';

interface DeliveryContentProps {
  rawText: string;
  copiedKey: string;
  onCopy: (value: string) => void;
  t: Dict;
  /** Builds the step title for a service, e.g. "Log in to Coursera" / "Coursera ይግቡ". */
  loginTitle: (service: string) => string;
}

/* ---------------- helpers ---------------- */

const URL_LINE_RE = /^https?:\/\/\S+$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Google / Gemini activation links need a VPN from Ethiopia. */
function isGoogleHost(url: string): boolean {
  const h = hostOf(url);
  return h.endsWith('google.com') || h.includes('gemini');
}

/** Compact display for a long URL: host + tail. Copy still copies the full text. */
function shortenUrl(url: string): string {
  const host = hostOf(url) || url.slice(0, 24);
  return `${host}/…${url.slice(-8)}`;
}

function truncateMiddle(s: string, max = 42): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Clean label for a credential field — supplier wording mapped to store wording. */
function fieldLabel(field: DeliveryField, t: Dict): string {
  const l = field.label.toLowerCase();
  if (l.includes('pass') && l.includes('mail')) return t.emailPassword;
  if (l.includes('pass')) return t.password;
  if (l.includes('mail')) return t.email;
  return field.label;
}

/** All credentials of one account, deduped (Email, Password, Email password…). */
function collectCredentials(account: DeliveryAccount): DeliveryField[] {
  const seen = new Set<string>();
  const out: DeliveryField[] = [];
  for (const step of buildGuide(account)) {
    for (const f of step.fields) {
      const k = `${f.label.toLowerCase()}|${f.value}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(f);
      }
    }
  }
  return out;
}

/* ---------------- shared bits ---------------- */

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-5 h-5 rounded-full bg-apptext/10 text-brand-300 flex items-center justify-center text-[10px] font-black shrink-0">
      {n}
    </div>
  );
}

function OpenButton({ url, t }: { url: string; t: Dict }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-primary shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-1"
    >
      <span>{t.open}</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

/** One credential row: label + mono value + copy button. */
function FieldRow({
  field,
  t,
  copiedKey,
  onCopy,
}: {
  field: DeliveryField;
  t: Dict;
  copiedKey: string;
  onCopy: (v: string) => void;
}) {
  const copied = copiedKey === field.value;
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-appbg/70 border border-apptext/10 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[8px] font-black uppercase tracking-widest text-apptext-3">
          {fieldLabel(field, t)}
        </div>
        <div className="font-mono text-[13px] font-bold text-apptext break-all select-all">{field.value}</div>
      </div>
      <button
        type="button"
        onClick={() => onCopy(field.value)}
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
          copied ? 'bg-emerald-500 text-slate-950 scale-105' : 'btn-primary'
        }`}
        title={copied ? t.copied : t.copy}
      >
        {copied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

/** VPN-first warning (Google/Gemini activation from Ethiopia). */
function VpnCard({ t }: { t: Dict }) {
  return (
    <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center gap-2.5">
      <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0" />
      <div className="flex-1">
        <div className="text-[11px] font-black text-sky-300">{t.vpnStep}</div>
        <div className="text-[10px] text-sky-200/70 font-semibold">{t.vpnHint}</div>
      </div>
      <StepBadge n={1} />
    </div>
  );
}

/* ---------------- simple keys / activation links ---------------- */

function SimpleKeys({ rawText, copiedKey, onCopy, t }: DeliveryContentProps) {
  const keys = (rawText || '')
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean);

  const numbered = keys.length > 1;
  const needsVpn = keys.some((k) => URL_LINE_RE.test(k) && isGoogleHost(k));

  return (
    <div className="space-y-2">
      {needsVpn && <VpnCard t={t} />}

      {keys.map((key, keyIdx) => {
        const isUrl = URL_LINE_RE.test(key);
        const display = isUrl ? shortenUrl(key) : truncateMiddle(key);
        const copied = copiedKey === key;
        return (
          <div
            key={keyIdx}
            className="rounded-2xl bg-appbg/80 border border-brand-400/30 p-3.5 flex items-center gap-2.5"
          >
            {numbered ? <StepBadge n={keyIdx + 1} /> : null}
            {isUrl ? (
              <Link2 className="w-4 h-4 text-brand-400 shrink-0" />
            ) : (
              <KeyRound className="w-4 h-4 text-brand-400 shrink-0" />
            )}
            <span className="flex-1 min-w-0 font-mono text-[12px] font-bold text-brand-300 break-all select-all">
              {display}
            </span>
            {isUrl && <OpenButton url={key} t={t} />}
            <button
              type="button"
              onClick={() => onCopy(key)}
              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                copied ? 'bg-emerald-500 text-slate-950 scale-105' : 'btn-primary'
              }`}
              title={copied ? t.copied : t.copy}
            >
              {copied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- rich account deliveries ---------------- */

function NotesCards({
  account,
  t,
}: {
  account: DeliveryAccount;
  t: Dict;
}) {
  return (
    <>
      {account.notes.map((note, nIdx) => (
        <div
          key={nIdx}
          className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-[11px] leading-relaxed space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{note.text}</span>
          </div>
          {note.url && (
            <div className="pl-5">
              <a
                href={note.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost px-3 py-1.5 rounded-xl text-amber-300 text-[10px] font-black inline-flex items-center gap-1"
              >
                <span>{t.open}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** Single account: guide steps with credentials inline (current proven layout). */
function SingleAccountGuide(props: DeliveryContentProps & { account: DeliveryAccount }) {
  const { account, copiedKey, onCopy, t, loginTitle } = props;
  const steps = buildGuide(account);
  let stepNo = 0;

  return (
    <div className="space-y-2">
      {steps.map((step, sIdx) => {
        stepNo += 1;
        const isInbox = step.kind === 'inbox';
        return (
          <div key={sIdx} className="rounded-2xl bg-apptext/[0.04] border border-apptext/10 p-3 space-y-2">
            <div className="flex items-center gap-2.5">
              <StepBadge n={stepNo} />
              {isInbox && <Mail className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
              <span className="flex-1 min-w-0 text-[12px] font-black text-apptext truncate">
                {isInbox ? t.openInbox : loginTitle(step.service)}
              </span>
              {step.url && <OpenButton url={step.url} t={t} />}
            </div>
            {step.fields.length > 0 && (
              <div className="space-y-1.5 pl-7">
                {step.fields.map((f, fIdx) => (
                  <FieldRow key={fIdx} field={f} t={t} copiedKey={copiedKey} onCopy={onCopy} />
                ))}
              </div>
            )}
            {isInbox && <p className="pl-7 text-[10px] text-apptext-3 font-semibold">{t.inboxHint}</p>}
          </div>
        );
      })}
      <NotesCards account={account} t={t} />
    </div>
  );
}

/** Multiple accounts: instructions ONCE, then a numbered list of account credentials. */
function MultiAccountGuide(props: DeliveryContentProps & { accounts: DeliveryAccount[] }) {
  const { accounts, copiedKey, onCopy, t, loginTitle } = props;
  const steps = buildGuide(accounts[0]); // same flow for every account
  let stepNo = 0;

  return (
    <div className="space-y-4">
      {/* Shared instruction steps — actions only, credentials live below */}
      <div className="space-y-2">
        {steps.map((step, sIdx) => {
          stepNo += 1;
          const isInbox = step.kind === 'inbox';
          return (
            <div key={sIdx} className="rounded-2xl bg-apptext/[0.04] border border-apptext/10 p-3">
              <div className="flex items-center gap-2.5">
                <StepBadge n={stepNo} />
                {isInbox && <Mail className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                <span className="flex-1 min-w-0 text-[12px] font-black text-apptext truncate">
                  {isInbox ? t.openInbox : loginTitle(step.service)}
                </span>
                {step.url && <OpenButton url={step.url} t={t} />}
              </div>
              <p className="pl-7 pt-1.5 text-[10px] text-apptext-3 font-semibold">
                {isInbox ? t.inboxHint : t.useOneBelow}
              </p>
            </div>
          );
        })}
      </div>

      {/* Numbered account credentials */}
      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-brand-300">
          {t.yourAccounts}
        </div>
        {accounts.map((account, aIdx) => {
          const creds = collectCredentials(account);
          return (
            <div key={aIdx} className="rounded-2xl bg-apptext/[0.04] border border-apptext/10 p-3">
              <div className="flex gap-2.5">
                <StepBadge n={aIdx + 1} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  {creds.map((f, fIdx) => (
                    <FieldRow key={fIdx} field={f} t={t} copiedKey={copiedKey} onCopy={onCopy} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <NotesCards account={accounts[0]} t={t} />
    </div>
  );
}

/**
 * Own-brand delivery guide. Rich account documents get numbered login steps;
 * multiple bought accounts are listed 1, 2, 3 under one shared instruction set.
 * Plain keys/links keep a compact look (long links shortened, VPN hint for Google).
 */
export default function DeliveryContent(props: DeliveryContentProps) {
  const { rawText } = props;
  const parsed = React.useMemo(() => parseDelivery(rawText || ''), [rawText]);

  if (!parsed.rich) return <SimpleKeys {...props} />;
  if (parsed.accounts.length === 1) return <SingleAccountGuide {...props} account={parsed.accounts[0]} />;
  return <MultiAccountGuide {...props} accounts={parsed.accounts} />;
}
