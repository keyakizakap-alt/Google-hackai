import type { ReactNode } from "react";

/** 各画面の見出し（英字の小見出し・見出し・説明）。画面ごとに大きさや位置がずれないよう共通にする */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <p className="font-display text-xl italic text-mute">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-bold text-ink [word-break:auto-phrase] sm:text-[28px]">{title}</h1>
      {children && <p className="mt-1 text-sm text-ink-soft">{children}</p>}
    </div>
  );
}
