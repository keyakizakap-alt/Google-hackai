/**
 * 外部リンクの許可リスト。AI の出力に含まれる URL はそのまま信用せず、
 * https かつ許可したドメインのものだけを表示する（フィッシング対策）。
 */
export const ALLOWED_LINK_HOSTS = [
  "beauty.hotpepper.jp", // サロン予約
  "www.jalan.net", // 宿泊予約
  "roote.ekispert.net", // 乗換案内
  "www.ekispert.net",
  "www.google.com", // Google マップの乗換検索・Google フライト（パスを下の ALLOWED_PATHS で絞る）
  "vertexaisearch.cloud.google.com", // Google 検索の出典（Gemini が返す転送用の URL。作成から約 30 日で開けなくなる）
] as const;

/** ホストごとに許可するパス。ここにないホストはパスを問わない */
const ALLOWED_PATHS: Partial<Record<(typeof ALLOWED_LINK_HOSTS)[number], readonly string[]>> = {
  // google.com は /url?q=… のような転送リンクを通さないよう、経路検索と航空券検索のページだけにする
  "www.google.com": ["/maps/dir/", "/travel/flights"],
  "vertexaisearch.cloud.google.com": ["/grounding-api-redirect/"],
};

export function safeExternalUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return undefined;
    if (u.username || u.password) return undefined;
    if (!(ALLOWED_LINK_HOSTS as readonly string[]).includes(u.hostname)) return undefined;
    const paths = ALLOWED_PATHS[u.hostname as (typeof ALLOWED_LINK_HOSTS)[number]];
    if (paths && !paths.some((p) => u.pathname.startsWith(p))) return undefined;
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

/**
 * Google フライトの検索（出発地・到着地・日付を入れた状態で開く）。空席と最新の運賃は利用者がここで確かめる。
 * q= に文章で条件を入れる形は Google フライトで広く使われている書き方（公式の仕様としては未確認）
 */
export const flightSearchUrl = (from: string, to: string, date?: string) => {
  const q = [`${from.trim()}から${to.trim()}`, date ? date.slice(0, 10) : ""].filter(Boolean).join(" ");
  return `https://www.google.com/travel/flights?hl=ja&q=${encodeURIComponent(`航空券 ${q}`)}`;
};
