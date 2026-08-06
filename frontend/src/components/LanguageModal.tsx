'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import Flag from '@/components/Flag';
import {
  LANGUAGES, hasChosenLanguage, setLanguage, useLang, useT, type Lang,
} from '@/lib/i18n';
import { triggerHaptic } from '@/lib/telegram';

/**
 * First-visit language gate. Shows once (until a choice is stored),
 * with framer-motion enter/exit animation. Never blocks render.
 */
export default function LanguageModal() {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  const t = useT();

  useEffect(() => {
    // Only first visit — if a choice exists, never show again
    if (!hasChosenLanguage()) setOpen(true);
  }, []);

  const pick = (code: Lang) => {
    triggerHaptic('medium');
    setLanguage(code, true);
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="lang-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            key="lang-card"
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-sm glass rounded-3xl p-6 space-y-5 border border-apptext/10"
          >
            <div className="text-center space-y-1.5">
              <h2 className="text-xl font-black text-apptext">{t.chooseLanguage}</h2>
              <p className="text-[11px] text-apptext-2 font-semibold">{t.languageSub}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {LANGUAGES.map((l, i) => {
                const active = lang === l.code;
                return (
                  <motion.button
                    key={l.code}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.06, type: 'spring', stiffness: 300, damping: 24 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => pick(l.code)}
                    className={`relative rounded-2xl p-4 border text-center transition-colors ${
                      active
                        ? 'bg-brand-500/15 border-brand-400/50'
                        : 'bg-apptext/[0.05] border-apptext/10 hover:border-brand-400/30'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="lang-check"
                        className="absolute top-2 right-2 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center"
                      >
                        <Check className="w-2.5 h-2.5 text-[#04120a] stroke-[4]" />
                      </motion.span>
                    )}
                    <div className="mb-2 flex justify-center">
                      <Flag code={l.code} className="w-12 h-8 shadow-lg shadow-black/40" />
                    </div>
                    <span className="block text-[10px] text-apptext-3 font-bold mb-1">{l.greeting}</span>
                    <span className={`block text-sm font-black ${active ? 'text-brand-300' : 'text-apptext'}`}>
                      {l.native}
                    </span>
                    <span className="block text-[9px] text-apptext-3 font-semibold mt-0.5">{l.english}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
