/**
 * 外部リンクの許可リスト。AI の出力に含まれる URL はそのまま信用せず、
 * https かつ許可したドメインのものだけを表示する（フィッシング対策）。
 */
export const ALLOWED_LINK_HOSTS = [
  "beauty.hotpepper.jp", // サロン予約
  "www.jalan.net", // 宿泊予約
  "roote.ekispert.net", // 乗換案内
  "www.ekispert.net",
] as const;

export function safeExternalUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return undefined;
    if (u.username || u.password) return undefined;
    if (!(ALLOWED_LINK_HOSTS as readonly string[]).includes(u.hostname)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** サロン検索ページ（AI の URL が使えないときの安全な代替） */
export const hotpepperSearchUrl = (q: string) =>
  `https://beauty.hotpepper.jp/CSP/bt/salonSearch/search/?freeword=${encodeURIComponent(q)}`;
export const jalanSearchUrl = (q: string) => `https://www.jalan.net/uw/uwp1700/uww1701.do?keyword=${encodeURIComponent(q)}`;
export const EKISPERT_ROUTE_URL = "https://roote.ekispert.net/";
