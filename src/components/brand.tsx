import type { SVGProps } from "react";

export function HeartMark({ className = "h-7 w-7", light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 28S3 20.2 3 11.6C3 7.4 6.2 4.5 9.9 4.5c2.6 0 4.8 1.4 6.1 3.6 1.3-2.2 3.5-3.6 6.1-3.6 3.7 0 6.9 2.9 6.9 7.1C29 20.2 16 28 16 28z" fill={light ? "#ffffff" : "#3a356f"} />
      <path d="M16 23.5s-8.5-5.3-8.5-11c0-2.4 1.8-4.2 4-4.2 1.9 0 3.4 1.2 4.5 3.4 1.1-2.2 2.6-3.4 4.5-3.4 2.2 0 4 1.8 4 4.2 0 5.7-8.5 11-8.5 11z" fill={light ? "#1b1935" : "#fff"} />
      <path d="M16 20.5s-5.5-3.5-5.5-7.3c0-1.5 1.1-2.6 2.5-2.6 1.3 0 2.3.9 3 2.5.7-1.6 1.7-2.5 3-2.5 1.4 0 2.5 1.1 2.5 2.6 0 3.8-5.5 7.3-5.5 7.3z" fill="var(--oshi-400)" />
    </svg>
  );
}

export function Logo({ size = "md", tone = "dark" }: { size?: "md" | "lg"; tone?: "dark" | "light" }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <HeartMark className={size === "lg" ? "h-9 w-9" : "h-7 w-7"} light={tone === "light"} />
      <span className={`font-display font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-ink"} ${size === "lg" ? "text-4xl" : "text-[27px]"}`}>
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
