"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/** スクロールで要素が入ってきたらフェードアップさせる（reduced-motion では即表示） */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  ...rest
}: { children: ReactNode; delay?: number; as?: ElementType; className?: string } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ "--delay": `${delay}ms` } as CSSProperties} {...rest}>
      {children}
    </Tag>
  );
}

/** 1 秒ごとに更新されるカウントダウン */
export function useCountdown(targetIso: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const diff = Math.max(0, Date.parse(targetIso) - (now ?? Date.parse(targetIso)));
  return {
    ready: now !== null,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
  };
}

/** 数字が変わるたびに上からスッと差し替わる */
export function TickDigits({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`inline-block tabular-nums ${className}`} aria-hidden>
      {value.split("").map((ch, i) => (
        <span key={`${i}-${ch}`} className="digit-tick inline-block">
          {ch}
        </span>
      ))}
    </span>
  );
}

/** 0 から目標値までカウントアップ */
export function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{v}</>;
}
