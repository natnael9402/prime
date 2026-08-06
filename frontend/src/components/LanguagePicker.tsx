'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import Flag from '@/components/Flag';
import { LANGUAGES, setLanguage, useLang, type Lang } from '@/lib/i18n';
import { triggerHaptic } from '@/lib/telegram';

/** Navbar language picker — animated dropdown, persists instantly. */
export default function LanguagePicker() {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  const pick = (code: Lang) => {
    triggerHaptic('light');
    setLanguage(code, true);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => {
          triggerHaptic('light');
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1 px-2.5 h-9 rounded-full bg-apptext/5 border border-apptext/10 text-apptext hover:border-brand-400/40 hover:text-brand-300 transition-colors"
        aria-label="Language"
      >
        <Flag code={current.code} className="w-5 h-[15px]" />
        <span className="text-[10px] font-black uppercase">{current.code}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="lang-menu"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="absolute right-0 top-11 z-[90] w-44 rounded-2xl border border-apptext/10 bg-appsurface/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            {LANGUAGES.map((l, i) => {
              const active = lang === l.code;
              return (
                <motion.button
                  key={l.code}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.15 }}
                  onClick={() => pick(l.code)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    active ? 'bg-brand-500/10' : 'hover:bg-apptext/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Flag code={l.code} className="w-6 h-[18px] shrink-0" />
                    <span>
                      <span className={`block text-xs font-black ${active ? 'text-brand-300' : 'text-apptext'}`}>
                        {l.native}
                      </span>
                      <span className="block text-[9px] text-apptext-3 font-semibold">{l.english}</span>
                    </span>
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-brand-400 stroke-[3]" />}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
