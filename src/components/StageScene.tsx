/**
 * ブランドモチーフ「推しに会う日のステージ」。
 * 逆光の LED スクリーン・トラスのスポットライト・スモーク・ペンライトの海を、SVG と CSS アニメーションで写実寄りに描く。
 * 実在アーティストの写真は使わない（演者はシルエットのみ）。
 */

/** 毎回同じ並びになる疑似乱数（描画のたびに人垣が変わらないように） */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const W = 1000;
const H = 400;
/** トラスに吊ったライトの位置（x） */
const LAMPS = [190, 330, 500, 670, 810];

interface Person {
  x: number;
  r: number;
  base: number;
  penlight: boolean;
  tilt: number;
  delay: number;
  duration: number;
}

function crowdRow(count: number, base: number, r: number, seed: number, penRate: number): Person[] {
  const rand = seeded(seed);
  const step = (W + r * 4) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: -r * 2 + step * i + (rand() - 0.5) * step * 0.6,
    r: r * (0.85 + rand() * 0.3),
    base: base + (rand() - 0.5) * r * 0.8,
    penlight: rand() < penRate,
    tilt: (rand() - 0.5) * 30,
    delay: -rand() * 1.6,
    duration: 1.2 + rand() * 0.6,
  }));
}

/** 頭と肩のシルエット */
function silhouette(p: Person) {
  const { x, r, base } = p;
  const headY = base - r * 3.1;
  return `M${x - r * 2.2},${base} C${x - r * 2.1},${base - r * 1.6} ${x - r * 1.3},${base - r * 1.9} ${x - r * 0.7},${base - r * 2.0}
    L${x - r * 0.45},${headY + r * 0.9} A${r},${r * 1.1} 0 1 1 ${x + r * 0.45},${headY + r * 0.9}
    L${x + r * 0.7},${base - r * 2.0} C${x + r * 1.3},${base - r * 1.9} ${x + r * 2.1},${base - r * 1.6} ${x + r * 2.2},${base} Z`;
}

/** 腕を上げてペンライトを振る */
function Penlight({ p, glowId }: { p: Person; glowId: string }) {
  const sx = p.x + p.r * 1.1;
  const sy = p.base - p.r * 2.1;
  const hx = sx + p.r * 0.6;
  const hy = sy - p.r * 2.6;
  return (
    <g className="stage-wave" style={{ animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, transformOrigin: `${sx}px ${sy}px` }}>
      <path d={`M${sx},${sy} L${hx},${hy}`} stroke="currentColor" strokeWidth={p.r * 0.55} strokeLinecap="round" />
      <line
        x1={hx}
        y1={hy}
        x2={hx + p.r * 0.35}
        y2={hy - p.r * 2.2}
        strokeWidth={p.r * 0.32}
        strokeLinecap="round"
        filter={`url(#${glowId})`}
        style={{ stroke: "rgb(var(--oshi-glow))" }}
      />
      <line x1={hx} y1={hy} x2={hx + p.r * 0.35} y2={hy - p.r * 2.2} stroke="#fff" strokeOpacity={0.85} strokeWidth={p.r * 0.12} strokeLinecap="round" />
    </g>
  );
}

/** 逆光に浮かぶ演者（中央がセンター） */
const PERFORMERS = [
  { x: 395, s: 0.9, arm: -1 },
  { x: 448, s: 0.95, arm: 0 },
  { x: 500, s: 1.05, arm: 1 },
  { x: 552, s: 0.95, arm: 0 },
  { x: 605, s: 0.9, arm: -1 },
];

function performer({ x, s, arm }: { x: number; s: number; arm: number }) {
  const g = 252; // 足もとの高さ
  const h = 62 * s;
  const head = 5.6 * s;
  const sh = g - h + head * 2.4; // 肩
  const armUp = arm === 1 ? `M${x + 5 * s},${sh + 2} L${x + 12 * s},${sh - 14 * s} L${x + 14 * s},${sh - 13 * s} L${x + 8 * s},${sh + 4}` : "";
  const armSide =
    arm === -1
      ? `M${x - 6 * s},${sh + 2} L${x - 13 * s},${sh + 16 * s} L${x - 11 * s},${sh + 17 * s} L${x - 4 * s},${sh + 5}`
      : `M${x - 6 * s},${sh + 2} L${x - 8 * s},${sh + 20 * s} L${x - 6 * s},${sh + 20 * s} L${x - 4 * s},${sh + 5}`;
  return (
    <g key={x}>
      <ellipse cx={x} cy={g - h + head} rx={head * 0.9} ry={head} />
      <path
        d={`M${x - 7 * s},${sh} Q${x},${sh - 3 * s} ${x + 7 * s},${sh} L${x + 5 * s},${g - h * 0.42} L${x + 4 * s},${g} L${x + 1 * s},${g} L${x},${g - h * 0.3} L${x - 1 * s},${g} L${x - 4 * s},${g} L${x - 5 * s},${g - h * 0.42} Z`}
      />
      <path d={armSide} />
      {armUp ? <path d={armUp} /> : <path d={`M${x + 6 * s},${sh + 2} L${x + 8 * s},${sh + 20 * s} L${x + 6 * s},${sh + 20 * s} L${x + 4 * s},${sh + 5}`} />}
    </g>
  );
}

export function StageScene({ className = "relative", crowd = 26 }: { className?: string; crowd?: number }) {
  // crowd は前列の人数の目安（小さな枠では減らす）
  const back = crowdRow(Math.round(crowd * 1.6), 318, 7, 7, 0.45);
  const front = crowdRow(crowd, 402, 15, 3, 0.4);
  const bokeh = (() => {
    const rand = seeded(11);
    return Array.from({ length: 14 }, () => ({ x: rand() * 100, y: 62 + rand() * 30, size: 6 + rand() * 16, o: 0.25 + rand() * 0.45, d: -rand() * 4 }));
  })();

  return (
    <div className={`stage-real overflow-hidden ${className}`} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="st-screen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2f7a" />
            <stop offset="55%" style={{ stopColor: "rgb(var(--oshi-glow))" }} stopOpacity={0.85} />
            <stop offset="100%" stopColor="#f6e9ff" stopOpacity={0.95} />
          </linearGradient>
          <radialGradient id="st-backglow" cx="50%" cy="55%" r="55%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--oshi-glow))" }} stopOpacity={0.55} />
            <stop offset="60%" stopColor="#3b3470" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#0d0b1e" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="st-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2b2550" />
            <stop offset="100%" stopColor="#0c0a1a" />
          </linearGradient>
          <radialGradient id="st-haze" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          <pattern id="st-scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="1.5" fill="#000" fillOpacity={0.08} />
          </pattern>
          <filter id="st-glow" x="-200%" y="-50%" width="500%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="st-soft">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* 会場の暗がりと、スクリーンの照り返し */}
        <rect width={W} height={H} fill="#0d0b1e" />
        <ellipse cx="500" cy="170" rx="460" ry="190" fill="url(#st-backglow)" />

        {/* LED スクリーン（走査線つき） */}
        <g>
          <rect x="250" y="78" width="500" height="160" rx="3" fill="url(#st-screen)" filter="url(#st-soft)" opacity={0.75} />
          <rect x="262" y="88" width="476" height="146" rx="2" fill="url(#st-screen)" />
          <rect x="262" y="88" width="476" height="146" rx="2" fill="url(#st-scan)" />
          <rect x="262" y="88" width="476" height="146" rx="2" fill="none" stroke="#fff" strokeOpacity={0.12} />
          {/* 左右のサブスクリーン */}
          <rect x="120" y="118" width="96" height="62" rx="2" fill="url(#st-screen)" opacity={0.55} />
          <rect x="784" y="118" width="96" height="62" rx="2" fill="url(#st-screen)" opacity={0.55} />
        </g>

        {/* トラスとライト */}
        <g stroke="#2e2a55" strokeWidth="5">
          <line x1="90" y1="44" x2="910" y2="44" />
          <line x1="90" y1="54" x2="910" y2="54" strokeWidth="2" />
        </g>
        {LAMPS.map((x) => (
          <g key={x}>
            <circle cx={x} cy="60" r="9" fill="#fff" opacity={0.35} filter="url(#st-glow)" />
            <circle cx={x} cy="60" r="4" fill="#fff" />
          </g>
        ))}

        {/* ステージ（奥行きのある床と縁の光） */}
        <polygon points="160,252 840,252 940,300 60,300" fill="url(#st-floor)" />
        <line x1="160" y1="252" x2="840" y2="252" stroke="#fff" strokeOpacity={0.55} strokeWidth="2" />
        <line x1="60" y1="300" x2="940" y2="300" style={{ stroke: "rgb(var(--oshi-glow))" }} strokeOpacity={0.7} strokeWidth="2" filter="url(#st-glow)" />

        {/* 演者のシルエット */}
        <g fill="#0b0a16">{PERFORMERS.map(performer)}</g>

        {/* 床のスモーク */}
        <ellipse cx="500" cy="262" rx="380" ry="40" fill="url(#st-haze)" />
        <ellipse cx="300" cy="300" rx="260" ry="34" fill="url(#st-haze)" opacity={0.7} />
        <ellipse cx="720" cy="296" rx="240" ry="30" fill="url(#st-haze)" opacity={0.6} />

        {/* 観客（奥の列 → 手前の列） */}
        <g fill="#16132e" color="#16132e">
          {back.map((p, i) => (
            <g key={`b${i}`}>
              {p.penlight && <Penlight p={p} glowId="st-glow" />}
              <path d={silhouette(p)} />
            </g>
          ))}
        </g>
        <g fill="#07060f" color="#07060f">
          {front.map((p, i) => (
            <g key={`f${i}`}>
              {p.penlight && <Penlight p={p} glowId="st-glow" />}
              <path d={silhouette(p)} />
            </g>
          ))}
        </g>
      </svg>

      {/* トラスから降りるスポットライト（スモークに当たった光の筋） */}
      {LAMPS.slice(0, 4).map((x, i) => (
        <div
          key={x}
          className="stage-beam"
          style={{ left: `${(x / W) * 100}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${7 + i}s` }}
        />
      ))}

      {/* 手前でぼけた光の粒 */}
      {bokeh.map((b, i) => (
        <span
          key={i}
          className="stage-bokeh absolute rounded-full"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.size, height: b.size, opacity: b.o, animationDelay: `${b.d}s` }}
        />
      ))}
      <div className="noise pointer-events-none absolute inset-0 opacity-60" />
    </div>
  );
}
