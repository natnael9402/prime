'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loader2, RefreshCw, Smile, X } from 'lucide-react';

export default function BotEmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emojiId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [packName, setPackName] = useState('hubxemoji');
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<any>(null);
  const [error, setError] = useState('');

  const loadPack = async (name = packName) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.getBotEmojiPack(name);
      setPack(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load Telegram emoji pack');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !pack) {
      loadPack('hubxemoji');
    }
  }, [open]);

  const selectedSticker = pack?.stickers?.find((s: any) => s.customEmojiId === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
          {selectedSticker?.thumbFileId ? (
            <img
              src={api.getEmojiFileUrl(selectedSticker.thumbFileId)}
              alt={selectedSticker.emoji}
              className="w-7 h-7 object-contain"
            />
          ) : (
            <Smile className={`w-4 h-4 ${value ? 'text-emerald-400' : 'text-slate-500'}`} />
          )}
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Telegram custom_emoji_id (e.g. 5368324170671202286)"
          className="flex-1 input-dark rounded-xl px-3 py-2 text-[11px] font-mono text-slate-100"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-2 rounded-xl bg-amber-400/15 border border-amber-500/30 text-amber-300 text-[11px] font-black whitespace-nowrap hover:bg-amber-400/25"
        >
          {open ? 'Hide Pack' : 'Pick HubX Emoji'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear emoji"
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-rose-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-3 space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {['hubxemoji', 'FinanceEmoji', 'NewsEmoji'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setPackName(preset);
                  loadPack(preset);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                  packName.toLowerCase() === preset.toLowerCase()
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                    : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="hubxemoji or https://t.me/addemoji/..."
              className="flex-1 input-dark rounded-xl px-3 py-1.5 text-[11px]"
            />
            <button
              type="button"
              onClick={() => loadPack(packName)}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-[11px] font-bold flex items-center gap-1.5 hover:bg-white/15"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Load Pack
            </button>
          </div>

          {error && <p className="text-[10px] text-rose-300 font-bold">{error}</p>}

          {!loading && pack && !pack.configured && (
            <p className="text-[10px] text-amber-300 font-bold">
              Set a live TELEGRAM_BOT_TOKEN in backend/.env to load stickers from Telegram. You can still paste a custom_emoji_id directly above.
            </p>
          )}

          {!loading && pack?.configured && (!pack.stickers || pack.stickers.length === 0) && (
            <p className="text-[10px] text-slate-400">
              No custom emojis found for pack &ldquo;{pack.name}&rdquo;. Check the pack short name or bot token.
            </p>
          )}

          {pack?.stickers?.length > 0 && (
            <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-52 overflow-y-auto pr-1">
              {pack.stickers.map((s: any, idx: number) => {
                const active = value === s.customEmojiId && !!s.customEmojiId;
                return (
                  <button
                    key={`${s.customEmojiId || s.fileId}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (s.customEmojiId) onChange(s.customEmojiId);
                    }}
                    title={`${s.emoji} · ${s.customEmojiId}`}
                    className={`aspect-square rounded-xl border flex items-center justify-center p-1 transition-all ${
                      active
                        ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {s.thumbFileId ? (
                      <img
                        src={api.getEmojiFileUrl(s.thumbFileId)}
                        alt={s.emoji}
                        loading="lazy"
                        className="w-6 h-6 object-contain"
                      />
                    ) : (
                      <span className="text-base">{s.emoji}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
