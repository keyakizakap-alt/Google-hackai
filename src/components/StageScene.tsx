/**
 * ブランドモチーフ「推しに会う日のステージ」。
 * スイープするスポットライト＋推しカラーのペンライトの海を CSS アニメーションで描く。
 * 実在アーティストの写真は使わない。
 */
const STARS = [
  [8, 14, 0], [22, 8, 0.6], [36, 20, 1.2], [64, 10, 0.3], [78, 22, 1.6], [90, 12, 0.9], [50, 6, 2], [14, 34, 1.1], [86, 38, 0.4],
];

export function StageScene({ className = "relative", crowd = 26 }: { className?: string; crowd?: number }) {
  return (
    <div className={`stage overflow-hidden ${className}`} aria-hidden>
      <div className="beam left-[8%]" style={{ animationDelay: "-2s" }} />
      <div className="beam left-[33%]" style={{ animationDuration: "9s" }} />
      <div className="beam left-[58%]" style={{ animationDelay: "-4s", animationDuration: "8s" }} />
      {STARS.map(([x, y, d], i) => (
        <span key={i} className="twinkle absolute h-1.5 w-1.5 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
      ))}
      {/* stage */}
      <div className="absolute inset-x-[18%] bottom-[44%] h-[3px] rounded-full bg-white/70 shadow-[0_0_24px_6px_rgb(255_255_255/0.45)]" />
      <div className="absolute bottom-[46%] left-1/2 flex -translate-x-1/2 gap-[3.5%]" style={{ width: "40%" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="flex flex-1 flex-col items-center">
            <span className="aspect-square w-[42%] rounded-full bg-white/80" />
            <span className="mt-[6%] h-3 w-[70%] rounded-t-full bg-white/70" />
          </span>
        ))}
      </div>
      {/* crowd + penlights */}
      <div className="absolute inset-x-0 bottom-0 flex h-[34%] items-end justify-between px-[1%]">
        {Array.from({ length: crowd }).map((_, i) => (
          <span key={i} className="relative flex h-full flex-1 flex-col items-center justify-end">
            <span
              className="penlight absolute bottom-[58%] h-[44%] w-[3px] rounded-full"
              style={{
                background: "linear-gradient(180deg, rgb(var(--oshi-glow)), rgb(var(--oshi-glow) / 0.2))",
                boxShadow: "0 0 10px 2px rgb(var(--oshi-glow) / 0.8)",
                animationDelay: `${-(i % 7) * 0.23}s`,
                animationDuration: `${1.3 + (i % 4) * 0.15}s`,
              }}
            />
            <span className="h-[60%] w-[82%] rounded-t-full bg-[#15132b]" style={{ height: `${52 + (i % 3) * 8}%` }} />
          </span>
        ))}
      </div>
      <div className="noise pointer-events-none absolute inset-0 opacity-60" />
    </div>
  );
}
