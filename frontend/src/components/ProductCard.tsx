'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, ArrowRight } from 'lucide-react';
import { triggerHaptic } from '@/lib/telegram';
import { useLang, useT } from '@/lib/i18n';
import { localizedProductContent } from '@/lib/productContent';

interface ProductProps {
  product: {
    id: string;
    name: string;
    slug: string;
    shortDesc: string;
    price: number;
    originalPrice?: number;
    currency: string;
    badge?: string;
    bannerUrl: string;
    instantDelivery: boolean;
    stock: number;
    category?: { name: string };
  };
}

export default function ProductCard({ product }: ProductProps) {
  const t = useT();
  const lang = useLang();
  const content = localizedProductContent(product, lang);
  const isOutOfStock = product.stock <= 0;
  const lowStock = product.stock > 0 && product.stock <= 5;
  const discountPercent = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  return (
    <Link
      href={`/product/${product.id}`}
      onClick={() => triggerHaptic('light')}
      className={`group glass card-hover rounded-2xl overflow-hidden flex flex-col h-full ${
        isOutOfStock ? 'opacity-60' : ''
      }`}
    >
      <div className="relative h-40 w-full bg-appbg overflow-hidden">
        <img
          src={product.bannerUrl}
          alt={content.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {discountPercent && !isOutOfStock && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-rose-500 text-white shadow-md">
            -{discountPercent}%
          </span>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-appbg/60 backdrop-blur-[2px]">
            <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-black">
              {t.soldOut}
            </span>
          </div>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1 gap-2">
        <div className="space-y-1 flex-1">
          <h3 className="text-[13px] font-bold text-apptext line-clamp-1 group-hover:text-brand-300 transition-colors">
            {content.name}
          </h3>
          <p className="text-[11px] text-apptext-3 line-clamp-2 leading-snug">{content.shortDesc}</p>
        </div>

        <div className="flex items-end justify-between gap-2 pt-2 border-t border-apptext/5">
          <div className="flex flex-col">
            {product.originalPrice && (
              <span className="text-[10px] text-apptext-3 line-through">
                {product.originalPrice.toLocaleString()} {product.currency}
              </span>
            )}
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black text-apptext">{product.price.toLocaleString()}</span>
              <span className="text-[10px] font-bold text-brand-400">{product.currency}</span>
            </div>
          </div>

          <div
            className={`px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 ${
              isOutOfStock ? 'bg-apptext/5 text-apptext-3' : 'btn-primary'
            }`}
          >
            <span>{isOutOfStock ? t.soldOut : t.buy}</span>
            {!isOutOfStock && <ArrowRight className="w-3 h-3 stroke-[3]" />}
          </div>
        </div>

        {lowStock && (
          <div className="flex items-center gap-1 text-[9px] font-bold text-orange-400">
            <Zap className="w-3 h-3 fill-current" />
            <span>{product.stock} {t.keys} {t.left}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
