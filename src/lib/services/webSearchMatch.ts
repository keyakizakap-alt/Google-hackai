/**
 * Google 検索の結果と、プランに書かれた名前・価格を照合する部品（サーバー・検査の両方で使う）。
 */

/** 比べるための正規化（全角・半角、空白、区切りの違いを吸収する） */
export function normalizeForMatch(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s・･\-‐−–—_/()（）「」『』【】]/g, "");
}

/** 価格が本文にそのまま書かれているか（12,000 / 12000 / 1万2000 のような書き方） */
export function textMentionsPrice(text: string, price: number): boolean {
  const t = text.normalize("NFKC").replace(/[,，\s]/g, "");
  const man = Math.floor(price / 10_000);
  const rest = price % 10_000;
  const forms = [String(price)];
  if (man > 0) forms.push(rest === 0 ? `${man}万` : `${man}万${rest}`);
  return forms.some((f) => new RegExp(`(^|[^0-9])${f}(?![0-9])`).test(t));
}
