import React from 'react';

export type FlagCode = 'us' | 'et';

/** UI language -> flag artwork mapping */
const LANG_FLAG: Record<string, FlagCode> = { en: 'us', am: 'et' };

const VIEWBOX: Record<FlagCode, string> = {
  us: '0 0 7410 3900',
  et: '0 0 1200 600',
};

const ART: Record<FlagCode, React.ReactNode> = {
  us: (
    <><path fill="#b31942" d="M0 0h7410v3900H0"/><path stroke="#FFF" strokeWidth="300" d="M0 450h7410m0 600H0m0 600h7410m0 600H0m0 600h7410m0 600H0"/><path fill="#0a3161" d="M0 0h2964v2100H0"/><g fill="#FFF"><g id="us-d"><g id="us-c"><g id="us-e"><g id="us-b"><path id="us-a" d="m247 90 70.534 217.082-184.66-134.164h228.253L176.466 307.082z"/><use xlinkHref="#us-a" y="420"/><use xlinkHref="#us-a" y="840"/><use xlinkHref="#us-a" y="1260"/></g><use xlinkHref="#us-a" y="1680"/></g><use xlinkHref="#us-b" x="247" y="210"/></g><use xlinkHref="#us-c" x="494"/></g><use xlinkHref="#us-d" x="988"/><use xlinkHref="#us-c" x="1976"/><use xlinkHref="#us-e" x="2470"/></g></>
  ),
  et: (
    <><path fill="#da121a" d="M0 0h1200v600H0z"/><path fill="#fcdd09" d="M0 0h1200v400H0z"/><path fill="#078930" d="M0 0h1200v200H0z"/><g transform="matrix(1.66667 0 0 1.66667 600 300)"><circle r="120" fill="#0f47af"/><g id="et-a"><path d="m0-96-4.206 12.944 17.348 53.39h-23.13l-2.599 8h74.163l11.011-8H21.553Z" fill="#fcdd09"/><path d="m25.863-35.597 30.564-42.069" stroke="#fcdd09" strokeWidth="4"/></g><use xlinkHref="#et-a" transform="rotate(72)" width="100%" height="100%"/><use xlinkHref="#et-a" transform="rotate(144)" width="100%" height="100%"/><use xlinkHref="#et-a" transform="rotate(-144)" width="100%" height="100%"/><use xlinkHref="#et-a" transform="rotate(-72)" width="100%" height="100%"/></g></>
  ),
};

/**
 * ONE flag component — flags inlined as vector SVG.
 * Crisp at any size (no <img> cropping), theme-aware ring, rounded corners.
 * Usage: <Flag code="am" className="w-6 h-[18px]" />
 */
export default function Flag({ code, className }: { code: string; className?: string }) {
  const fc: FlagCode = LANG_FLAG[code] || 'et';
  return (
    <span className={`inline-block overflow-hidden rounded-[3px] ring-1 ring-apptext/10 leading-none ${className || ''}`}>
      <svg
        viewBox={VIEWBOX[fc]}
        preserveAspectRatio="xMidYMid slice"
        className="block w-full h-full"
        aria-hidden="true"
        focusable="false"
      >
        {ART[fc]}
      </svg>
    </span>
  );
}
