import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import LanguageModal from '@/components/LanguageModal';
import ThemeSync from '@/components/ThemeSync';

const displayFont = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Prime Store — Instant Digital Keys',
  description: 'Premium digital license keys & subscriptions with instant delivery. Pay with Chapa (Telebirr, CBE Birr, Card).',
};

export const viewport: Viewport = {
  themeColor: '#0B0F14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="am" className={`dark ${displayFont.variable}`} suppressHydrationWarning>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var tg=window.Telegram&&window.Telegram.WebApp;if(!tg||!tg.themeParams)return;var p=tg.themeParams;var r=document.documentElement;var hx=function(h){if(!h)return null;var m=h.replace('#','');if(m.length===3){m=m.split('').map(function(c){return c+c;}).join('');}if(!/^[0-9a-fA-F]{6}$/.test(m))return null;var n=parseInt(m,16);return ((n>>16)&255)+' '+((n>>8)&255)+' '+(n&255);};var s=function(k,v){if(v)r.style.setProperty(k,v);};s('--bg-rgb',hx(p.bg_color));s('--surface-rgb',hx(p.secondary_bg_color||p.section_bg_color));s('--text-1',hx(p.text_color));s('--text-2',hx(p.hint_color));s('--text-3',hx(p.subtitle_text_color||p.hint_color));r.setAttribute('data-tg-scheme',tg.colorScheme||'dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-dvh overflow-hidden antialiased" suppressHydrationWarning>
        {/* Google Analytics (GA4) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-48DT0WCDTN"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-48DT0WCDTN');
          `}
        </Script>
        <ThemeSync />
        {children}
        <LanguageModal />
      </body>
    </html>
  );
}
