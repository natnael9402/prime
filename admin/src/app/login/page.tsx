'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setAdminToken } from '@/lib/api';
import { KeyRound, Mail, Lock, Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.adminLogin(email.trim(), password);
      setAdminToken(res.token);
      router.replace('/');
    } catch (err: any) {
      if (err?.response?.status === 429) setError('Too many attempts — wait a minute and try again.');
      else setError('Wrong email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 fade-up">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/25">
            <KeyRound className="w-7 h-7 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">
              KEY<span className="text-amber-400">VAULT</span> Admin
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold mt-1 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Restricted area — sign in to continue
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-3xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/5 border border-white/10 px-3.5 focus-within:border-amber-400/50 transition-colors">
              <Mail className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@careerlyft.ai"
                className="flex-1 min-w-0 bg-transparent py-3 text-sm text-white placeholder:text-slate-600 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password</label>
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/5 border border-white/10 px-3.5 focus-within:border-amber-400/50 transition-colors">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="flex-1 min-w-0 bg-transparent py-3 text-sm text-white placeholder:text-slate-600 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="shrink-0 text-slate-500 hover:text-slate-300"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-bold text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 text-sm font-black flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
