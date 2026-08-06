'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Check, CloudUpload, Images, Loader2, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';

type UploadedImage = { key: string; url: string; size: number; lastModified: string | null };

const fmtSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * Drop-anywhere image picker backed by Cloudflare R2.
 * - Drag & drop or browse to upload (multi-file) → returns CDN URLs via onAdd
 * - Library modal lists every previous upload in the folder, newest first
 */
export default function R2ImagePicker({
  folder = 'products',
  accent = 'amber',
  onAdd,
}: {
  folder?: 'products' | 'cards';
  accent?: 'amber' | 'sky';
  onAdd: (url: string) => void;
}) {
  const accents = {
    amber: {
      drop: 'hover:border-amber-400/50 hover:bg-amber-400/5',
      drag: 'border-amber-400/70 bg-amber-400/10',
      badge: 'bg-amber-400 text-slate-950',
    },
    sky: {
      drop: 'hover:border-sky-400/50 hover:bg-sky-400/5',
      drag: 'border-sky-400/70 bg-sky-400/10',
      badge: 'bg-sky-500 text-white',
    },
  }[accent];

  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<UploadedImage[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!list.length) return;
      setError('');
      setUploading({ done: 0, total: list.length });
      try {
        for (let i = 0; i < list.length; i++) {
          const { url } = await api.uploadImage(list[i], folder);
          onAdd(url);
          setUploading({ done: i + 1, total: list.length });
        }
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Image upload failed');
      } finally {
        setUploading(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [folder, onAdd],
  );

  const openLibrary = async () => {
    setLibraryOpen(true);
    setLibraryLoading(true);
    try {
      const images = await api.listUploadedImages(folder);
      setLibrary(Array.isArray(images) ? images : []);
    } catch {
      setLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  const pick = (img: UploadedImage) => {
    onAdd(img.url);
    setAddedKeys((prev) => new Set(prev).add(img.key));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`flex-1 min-h-[92px] rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center gap-1 px-3 py-3 cursor-pointer transition-all ${accents.drop} ${
            dragOver ? accents.drag : ''
          } ${uploading ? 'pointer-events-none' : ''}`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              <span className="text-[10px] font-black text-slate-300">
                Uploading {uploading.done}/{uploading.total} to CDN…
              </span>
            </>
          ) : (
            <>
              <CloudUpload className="w-5 h-5 text-slate-400" />
              <span className="text-[10px] font-black text-slate-300 text-center">
                Drop images here or <span className="underline">browse</span> — multi-select works
              </span>
              <span className="text-[9px] text-slate-500 text-center">
                JPEG · PNG · WebP · GIF · AVIF → Cloudflare R2 CDN
              </span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>

        {/* Library button */}
        <button
          type="button"
          onClick={openLibrary}
          className="sm:w-24 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] flex sm:flex-col items-center justify-center gap-1.5 py-3 text-slate-300 transition-colors"
        >
          <Images className="w-5 h-5" />
          <span className="text-[10px] font-black">Library</span>
        </button>
      </div>

      {error && (
        <div className="mt-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px] font-bold">
          {error}
        </div>
      )}

      {/* Library modal */}
      {libraryOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setLibraryOpen(false)}
        >
          <div
            className="glass rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-sm font-black text-white">CDN Library</h3>
                <p className="text-[10px] text-slate-500">
                  {library.length} uploads in R2 · newest first — click images to add them
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openLibrary}
                  title="Refresh"
                  className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryOpen(false)}
                  className="btn-ghost w-8 h-8 rounded-lg flex items-center justify-center text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {libraryLoading ? (
                <div className="py-16 flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[11px] font-bold">Loading uploads…</span>
                </div>
              ) : library.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-2 text-slate-600">
                  <Images className="w-8 h-8" />
                  <span className="text-[11px] font-bold">No uploads yet — drop images on the left</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {library.map((img) => {
                    const added = addedKeys.has(img.key);
                    return (
                      <button
                        type="button"
                        key={img.key}
                        onClick={() => pick(img)}
                        className={`group relative rounded-2xl overflow-hidden border text-left transition-all ${
                          added ? 'border-emerald-400/70' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img
                          src={img.url}
                          alt={img.key}
                          loading="lazy"
                          className="w-full h-28 object-cover bg-slate-900"
                        />
                        <div className="px-2 py-1.5 bg-black/40 flex items-center justify-between gap-1">
                          <span className="text-[8px] text-slate-400 truncate">
                            {img.key.split('/').pop()}
                          </span>
                          <span className="text-[8px] text-slate-500 whitespace-nowrap">{fmtSize(img.size)}</span>
                        </div>
                        <div
                          className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                            added ? 'opacity-100 bg-emerald-500/20' : 'opacity-0 group-hover:opacity-100 bg-black/50'
                          }`}
                        >
                          <span
                            className={`px-2.5 py-1 rounded-full text-[9px] font-black flex items-center gap-1 ${
                              added ? 'bg-emerald-400 text-slate-950' : accents.badge
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            {added ? 'ADDED' : 'USE'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
