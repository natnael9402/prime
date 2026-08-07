import React from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * Payment method badges (Telebirr / CBE Birr / Chapa).
 * White chips so the brand logos read cleanly on the dark theme.
 */
export default function PaymentLogos() {
  return (
    <div className="flex items-center gap-2">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <div className="flex items-center gap-1.5">
        <span className="h-6 px-1.5 rounded-md bg-white flex items-center">
          <img src="/payments/telebirr.svg" alt="Telebirr" className="h-4 w-auto" loading="lazy" />
        </span>
        <span className="h-6 px-1.5 rounded-md bg-white flex items-center">
          <img src="/payments/cbe-birr.svg" alt="CBE Birr" className="h-4 w-auto" loading="lazy" />
        </span>
        <span className="h-6 px-1.5 rounded-md bg-white flex items-center">
          <img src="/payments/chapa.svg" alt="Chapa" className="h-4 w-auto" loading="lazy" />
        </span>
      </div>
    </div>
  );
}
