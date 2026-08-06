'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * Dark/light theme toggle for the admin console.
 * Dark is the default; light mode adds the `light` class to <html>
 * and persists as kv-admin-theme in localStorage (applied pre-paint
 * by the inline script in layout.tsx).
 */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem('kv-admin-theme', next ? 'light' : 'dark');
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Dark mode' : 'Light mode'}
      className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
    >
      {light ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
