/**
 * 遠征先の立ち寄り先（サンプルデータ）。
 *
 * 推し活の遠征では、物販待ちの前後・開演前・終演後にまとまった空き時間が生まれる。
 * その時間を「ご当地グルメ」「写真を撮れる場所」「座って待てる場所」で埋めるための候補。
 *
 * 範囲を会場辞書（src/lib/eventDetection/venues.ts）に出てくる 12 エリアに絞っている。
 * 網羅的な観光データベースではなく、遠征のついでに寄れる範囲だけを持つ。
 *
 * **所要時間・予算は目安のサンプル値**で、営業時間は持たない。
 * 実在店舗の営業情報を保証しないため、プランには「確認してください」を添えて出す。
 */

export const SPOT_CATEGORIES = ["gourmet", "photo", "rest"] as const;
export type SpotCategory = (typeof SPOT_CATEGORIES)[number];

export const SPOT_CATEGORY_LABEL: Readonly<Record<SpotCategory, string>> = {
  gourmet: "ご当地グルメ",
  photo: "写真を撮れる場所",
  rest: "座って待てる場所",
};

export interface Spot {
  id: string;
  /** 会場辞書の area と同じ表記 */
  area: string;
  name: string;
  category: SpotCategory;
  /** 会場最寄り駅からのおおよその移動分数 */
  minutesFromVenue: number;
  /** 立ち寄りの目安時間 */
  stayMinutes: number;
  /** 雨でも濡れずに過ごせるか */
  indoor: boolean;
  note: string;
}

const S = (
  id: string, area: string, name: string, category: SpotCategory,
  minutesFromVenue: number, stayMinutes: number, indoor: boolean, note: string,
): Spot => ({ id, area, name, category, minutesFromVenue, stayMinutes, indoor, note });

export const SPOTS: readonly Spot[] = [
  // 東京
  S("tky-ramen", "東京", "ラーメン激戦区の一杯", "gourmet", 10, 40, true, "回転が速く、開演前でも入りやすい。"),
  S("tky-skyview", "東京", "高層階の無料展望スペース", "photo", 15, 30, true, "待ち合わせにも使える。雨でも景色が撮れる。"),
  S("tky-cafe", "東京", "駅直結のカフェ", "rest", 5, 45, true, "電源と席数が多く、物販待ちの前後に向く。"),
  // 神奈川
  S("kng-chukagai", "神奈川", "中華街の食べ歩き", "gourmet", 20, 60, false, "小籠包や肉まんを歩きながら。雨天は店内へ。"),
  S("kng-minatomirai", "神奈川", "みなとみらいの夜景スポット", "photo", 15, 30, false, "終演後の時間に向く。海沿いは風が強い。"),
  S("kng-bookcafe", "神奈川", "駅近のブックカフェ", "rest", 8, 45, true, "長時間いても落ち着ける。"),
  // 大阪
  S("osk-takoyaki", "大阪", "たこ焼きの名店", "gourmet", 12, 30, false, "立ち食い中心。open-air なので雨天は注意。"),
  S("osk-glico", "大阪", "道頓堀の定番フォトスポット", "photo", 25, 20, false, "人出が多く、撮影は時間に余裕を。"),
  S("osk-kissa", "大阪", "レトロ喫茶", "rest", 10, 50, true, "ミックスジュースで一息。座って待てる。"),
  // 愛知
  S("aic-hitsumabushi", "愛知", "ひつまぶしの店", "gourmet", 20, 60, true, "行列しやすいので開演の 3 時間前には。"),
  S("aic-oasis", "愛知", "ガラス張りの空中回廊", "photo", 25, 25, false, "夜はライトアップされる。"),
  S("aic-kissa", "愛知", "モーニングのある喫茶店", "rest", 15, 40, true, "朝入りの日に向く。"),
  // 北海道
  S("hkd-kaisen", "北海道", "市場の海鮮丼", "gourmet", 30, 45, true, "昼過ぎに閉まる店が多い。早めの時間に。"),
  S("hkd-akarenga", "北海道", "赤れんが庁舎まわり", "photo", 35, 30, false, "冬は積雪。足元に注意。"),
  S("hkd-cafe", "北海道", "スープカレーの店", "rest", 25, 50, true, "体が温まる。冷えた日の立て直しに。"),
  // 福岡
  S("fko-motsunabe", "福岡", "もつ鍋の店", "gourmet", 15, 70, true, "終演後の時間に向く。予約推奨。"),
  S("fko-yatai", "福岡", "中洲の屋台通り", "photo", 20, 40, false, "夕方から。雨天は営業が減る。"),
  S("fko-cafe", "福岡", "駅ビルのカフェ", "rest", 5, 40, true, "移動の合間に使いやすい。"),
  // 千葉
  S("chb-sushi", "千葉", "港町の寿司店", "gourmet", 25, 50, true, "地魚が中心。"),
  S("chb-seaside", "千葉", "海沿いの遊歩道", "photo", 10, 30, false, "海風が強い日は寒い。"),
  S("chb-mall", "千葉", "駅直結のモール", "rest", 5, 45, true, "雨天の待機先として機能する。"),
  // 兵庫
  S("hyg-sobameshi", "兵庫", "そばめしの店", "gourmet", 15, 35, true, "軽く食べたいときに。"),
  S("hyg-harborland", "兵庫", "港の夜景", "photo", 20, 30, false, "終演後でも明るい。"),
  S("hyg-kissa", "兵庫", "老舗の洋菓子店", "rest", 12, 40, true, "イートインあり。"),
  // 宮城
  S("myg-gyutan", "宮城", "牛たん通り", "gourmet", 5, 45, true, "駅ビル内。移動の合間に入れる。"),
  S("myg-keyaki", "宮城", "けやき並木", "photo", 10, 25, false, "季節の光が良い。冬は冷える。"),
  S("myg-cafe", "宮城", "駅近のカフェ", "rest", 5, 40, true, "新幹線待ちにも使える。"),
  // 埼玉
  S("stm-unagi", "埼玉", "宿場町のうなぎ店", "gourmet", 30, 60, true, "落ち着いた店構え。予約推奨。"),
  S("stm-bonsai", "埼玉", "盆栽の街並み", "photo", 35, 30, false, "静かで人が少ない。"),
  S("stm-mall", "埼玉", "駅直結のモール", "rest", 5, 45, true, "ドーム公演の待機先に向く。"),
  // 静岡
  S("szo-oden", "静岡", "静岡おでん横丁", "gourmet", 12, 40, true, "小さな店が並ぶ。体が温まる。"),
  S("szo-fuji", "静岡", "富士山の見える高台", "photo", 30, 30, false, "晴天時のみ。曇天だと見えない。"),
  S("szo-cafe", "静岡", "お茶のカフェ", "rest", 10, 40, true, "茶葉を選んで淹れてもらえる。"),
  // 広島
  S("hrs-okonomi", "広島", "お好み焼きの集合ビル", "gourmet", 15, 45, true, "店が積層していて選びやすい。"),
  S("hrs-peace", "広島", "平和記念公園", "photo", 20, 40, false, "時間をかけて歩きたい場所。"),
  S("hrs-cafe", "広島", "川沿いのカフェ", "rest", 15, 40, true, "終演後の待機にも使える。"),
];

export interface SpotQuery {
  area: string;
  /** 使える時間（分）。移動と滞在の合計がこれに収まるものだけ返す */
  availableMinutes: number;
  category?: SpotCategory;
  /** 雨・雪のときは屋内だけに絞る */
  indoorOnly?: boolean;
}

/**
 * 空き時間に収まる立ち寄り先を返す。
 * 会場との往復を考えるため、移動は 2 倍で見積もる。
 */
export function searchSpots(q: SpotQuery): Spot[] {
  const area = q.area.replace(/[都道府県]$/, "");
  return SPOTS.filter((s) => s.area === area)
    .filter((s) => !q.category || s.category === q.category)
    .filter((s) => !q.indoorOnly || s.indoor)
    .filter((s) => s.minutesFromVenue * 2 + s.stayMinutes <= q.availableMinutes)
    .sort((a, b) => a.minutesFromVenue - b.minutesFromVenue);
}

/** 立ち寄り先を持っているエリアの一覧（UI の案内に使う） */
export const SPOT_AREAS: readonly string[] = [...new Set(SPOTS.map((s) => s.area))];
