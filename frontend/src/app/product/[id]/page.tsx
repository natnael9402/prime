import type { Metadata } from 'next';
import ProductClient from './ProductClient';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

type Props = { params: Promise<{ id: string }> };

/**
 * Server-side metadata so shared product links unfurl with the product
 * image/name/price (Telegram, WhatsApp, Twitter all read OpenGraph tags).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API}/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { title: 'Prime Store' };
    const p = await res.json();
    const title = `${p.name} — Prime Store`;
    const description = (
      p.shortDesc ||
      p.description ||
      'Premium digital product with instant delivery.'
    ).slice(0, 200);
    const images = p.bannerUrl ? [{ url: p.bannerUrl }] : [];
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: p.bannerUrl ? [p.bannerUrl] : [],
      },
    };
  } catch {
    return { title: 'Prime Store' };
  }
}

export default function Page() {
  return <ProductClient />;
}
