"use client";

import { ExternalLink, Search } from "lucide-react";
import type { WebSearchRecord } from "@/lib/agent/types";
import { safeExternalUrl } from "@/lib/safeUrl";
import { formatJst } from "@/lib/time";

const PURPOSE_LABEL: Record<WebSearchRecord["purpose"], string> = {
  beauty_salon: "美容サロン",
  hotel: "宿",
  flight: "飛行機の便",
};

/**
 * Google 検索で調べたこと（出典と、Google の検索候補）。
 * 検索候補（Search Suggestions）は Gemini の利用条件で表示が必要なため、受け取った HTML を変えずに表示する。
 * 外部の HTML をこの画面に直接入れないよう、スクリプトを動かせない iframe（sandbox）の中に表示する。
 */
export function WebSearchSources({ records }: { records?: WebSearchRecord[] }) {
  if (!records?.length) return null;
  return (
    <section className="card p-5" aria-label="Google 検索で調べたこと">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <Search className="h-4 w-4 text-lav-600" />
        Google 検索で調べたこと
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        お店・宿・便と価格は、検索したときの情報です。空きや最新の価格は、出典か予約サイトで確かめてください。出典のリンクは 30 日ほどで開けなくなることがあります。
      </p>
      <ul className="mt-3 space-y-4">
        {records.map((r, i) => (
          <li key={i} className="rounded-xl border border-line p-3">
            <p className="text-xs font-semibold text-ink">
              {PURPOSE_LABEL[r.purpose]}
              <span className="ml-2 font-normal text-mute">{formatJst(r.searchedAt)} に検索</span>
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {r.sources.map((s, j) => {
                const href = safeExternalUrl(s.uri);
                return href ? (
                  <li key={j}>
                    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-lav-700 underline underline-offset-2">
                      {s.title || `出典 ${j + 1}`}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ) : null;
              })}
            </ul>
            {r.suggestionsHtml && (
              <iframe
                title={`${PURPOSE_LABEL[r.purpose]}の Google 検索候補`}
                // 候補を押したら新しいタブで Google の検索結果を開く（iframe の中では Google のページを表示できないため）
                srcDoc={`<base target="_blank">${r.suggestionsHtml}`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="mt-2 h-[72px] w-full rounded-lg border-0"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
