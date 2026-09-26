import type { SVGProps } from "react";

export function HeartMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 28S3 20.2 3 11.6C3 7.4 6.2 4.5 9.9 4.5c2.6 0 4.8 1.4 6.1 3.6 1.3-2.2 3.5-3.6 6.1-3.6 3.7 0 6.9 2.9 6.9 7.1C29 20.2 16 28 16 28z" fill="#3a356f" />
      <path d="M16 23.5s-8.5-5.3-8.5-11c0-2.4 1.8-4.2 4-4.2 1.9 0 3.4 1.2 4.5 3.4 1.1-2.2 2.6-3.4 4.5-3.4 2.2 0 4 1.8 4 4.2 0 5.7-8.5 11-8.5 11z" fill="#fff" />
      <path d="M16 20.5s-5.5-3.5-5.5-7.3c0-1.5 1.1-2.6 2.5-2.6 1.3 0 2.3.9 3 2.5.7-1.6 1.7-2.5 3-2.5 1.4 0 2.5 1.1 2.5 2.6 0 3.8-5.5 7.3-5.5 7.3z" fill="#ec8aa2" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <HeartMark className={size === "lg" ? "h-9 w-9" : "h-7 w-7"} />
      <span className={`font-display font-semibold tracking-tight text-ink ${size === "lg" ? "text-4xl" : "text-[26px]"}`}>
        Oshi<span className="italic">Ready</span>
      </span>
    </span>
  );
}

export function GoogleG(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden {...props}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** 公演イメージ（実在アーティストの写真は使わず、ステージの光を抽象的に表現） */
export function StageArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9b8ec" />
          <stop offset="0.55" stopColor="#f0c6dc" />
          <stop offset="1" stopColor="#fbe3ec" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="400" height="150" fill="url(#sky)" />
      {[-40, -18, 0, 18, 40].map((r, i) => (
        <path key={i} d="M200 18 L186 170 L214 170 Z" fill="url(#beam)" opacity="0.55" transform={`rotate(${r} 200 18)`} />
      ))}
      <ellipse cx="200" cy="50" rx="170" ry="70" fill="url(#glow)" />
      {[
        [40, 30], [90, 18], [310, 26], [355, 44], [140, 40], [262, 36], [70, 60], [330, 70],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 5} L${x + 1.5} ${y - 1.5} L${x + 5} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 5} L${x - 1.5} ${y + 1.5} L${x - 5} ${y} L${x - 1.5} ${y - 1.5} Z`} fill="#fff" opacity="0.9" />
      ))}
      <rect x="110" y="96" width="180" height="10" rx="3" fill="#fff" opacity="0.55" />
      {[150, 175, 200, 225, 250].map((x, i) => (
        <g key={i} fill="#6e5f9f" opacity="0.55">
          <circle cx={x} cy="76" r="6" />
          <path d={`M${x - 8} 96 Q${x} 80 ${x + 8} 96 Z`} />
        </g>
      ))}
      <g fill="#7b6aa8" opacity="0.35">
        {Array.from({ length: 22 }).map((_, i) => (
          <circle key={i} cx={10 + i * 18.5} cy={140 - (i % 3) * 3} r={9} />
        ))}
      </g>
      <g fill="#ec8aa2">
        {[40, 120, 205, 290, 365].map((x, i) => (
          <rect key={i} x={x} y={118 - (i % 2) * 6} width="3" height="14" rx="1.5" transform={`rotate(${i % 2 ? 12 : -12} ${x} 125)`} />
        ))}
      </g>
    </svg>
  );
}

/** 下部バナーの街並み＋ドーム＋新幹線のシルエット */
export function SkylineArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 110" preserveAspectRatio="xMaxYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="city" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8b2dc" />
          <stop offset="1" stopColor="#d9d3ee" />
        </linearGradient>
      </defs>
      <g fill="url(#city)" opacity="0.9">
        <rect x="380" y="40" width="22" height="70" />
        <rect x="406" y="22" width="16" height="88" />
        <rect x="426" y="50" width="26" height="60" />
        <rect x="456" y="30" width="14" height="80" />
        <rect x="690" y="36" width="20" height="74" />
        <rect x="714" y="52" width="30" height="58" />
        <rect x="748" y="28" width="16" height="82" />
      </g>
      <path d="M480 96 Q585 20 690 96 Z" fill="#cbc4e8" />
      <path d="M492 96 Q585 34 678 96" fill="none" stroke="#fff" strokeWidth="2" opacity="0.8" />
      {[520, 550, 585, 620, 650].map((x) => (
        <line key={x} x1={x} y1={96} x2={585 + (x - 585) * 0.3} y2={48} stroke="#fff" strokeWidth="1.2" opacity="0.7" />
      ))}
      <rect x="0" y="96" width="800" height="14" fill="#e6e1f3" />
      <path d="M260 92 L420 92 Q440 92 452 98 L452 104 L260 104 Z" fill="#fff" stroke="#b9b1db" />
      <rect x="275" y="95" width="150" height="3" fill="#7a71b5" opacity="0.6" />
    </svg>
  );
}
