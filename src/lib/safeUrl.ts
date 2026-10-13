/**
 * 外部リンクの許可リスト。AI の出力に含まれる URL はそのまま信用せず、
 * https かつ許可したドメインのものだけを表示する（フィッシング対策）。
 */
export const ALLOWED_LINK_HOSTS = [
  "beauty.hotpepper.jp", // サロン予約
  "www.jalan.net", // 宿泊予約
  "roote.ekispert.net", // 乗換案内
  "www.ekispert.net",
  "www.google.com", // Google マップの乗換検索（パスが /maps/dir/ のものだけ。下の ALLOWED_PATHS）
] as const;

/** ホストごとに許可するパス。ここにないホストはパスを問わない */
const ALLOWED_PATHS: Partial<Record<(typeof ALLOWED_LINK_HOSTS)[number], string>> = {
  // google.com は /url?q=… のような転送リンクを通さないよう、経路検索のページだけにする
  "www.google.com": "/maps/dir/",
};

export function safeExternalUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return undefined;
    if (u.username || u.password) return undefined;
    if (!(ALLOWED_LINK_HOSTS as readonly string[]).includes(u.hostname)) return undefined;
    const path = ALLOWED_PATHS[u.hostname as (typeof ALLOWED_LINK_HOSTS)[number]];
    if (path && !u.pathname.startsWith(path)) return undefined;
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
/**
 * 駅すぱあと for web の経路検索（出発駅・到着駅を入れた状態で開く）。
 * dep / arr は roote.ekispert.net の検索結果の URL で使われている名前。日時は利用者が画面で指定する
 */
export const ekispertRouteSearchUrl = (from: string, to: string) => {
  const dep = from.trim();
  const arr = to.trim();
  if (!dep || !arr) return EKISPERT_ROUTE_URL;
  return `${EKISPERT_ROUTE_URL}result?dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}`;
};

/**
 * Google マップの乗換検索（出発駅・到着駅を入れた状態で開く。API キー不要の Maps URLs）。
 * 所要時間の目安（待機系）で組んだ移動に付け、実際の電車を確かめてもらう
 */
export const transitSearchUrl = (from: string, to: string) => {
  const station = (s: string) => (s.trim().endsWith("駅") ? s.trim() : `${s.trim()}駅`);
  if (!from.trim() || !to.trim()) return "https://www.google.com/maps/dir/?api=1&travelmode=transit";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(station(from))}&destination=${encodeURIComponent(station(to))}&travelmode=transit`;
};
