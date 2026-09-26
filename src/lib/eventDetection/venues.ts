/**
 * 主要ライブ会場 → 最寄り駅の辞書（一般的に知られた最寄り駅の目安。公式アクセス情報で要確認）。
 * カレンダーの場所欄やタイトルから会場を特定し、移動プランの目的地に使う。
 * 長い名前から順に照合するため、配列の順番は問わない。
 */
export const VENUES: { name: string; aliases: string[]; station: string; area: string }[] = [
  { name: "京セラドーム大阪", aliases: ["京セラドーム", "京セラD", "大阪ドーム"], station: "ドーム前千代崎", area: "大阪" },
  { name: "東京ドーム", aliases: ["東京D", "Tokyo Dome"], station: "水道橋", area: "東京" },
  { name: "バンテリンドーム ナゴヤ", aliases: ["バンテリンドーム", "ナゴヤドーム"], station: "ナゴヤドーム前矢田", area: "愛知" },
  { name: "みずほPayPayドーム福岡", aliases: ["PayPayドーム", "福岡ドーム"], station: "唐人町", area: "福岡" },
  { name: "大和ハウス プレミストドーム", aliases: ["プレミストドーム", "札幌ドーム"], station: "福住", area: "北海道" },
  { name: "ベルーナドーム", aliases: ["西武ドーム"], station: "西武球場前", area: "埼玉" },
  { name: "エスコンフィールドHOKKAIDO", aliases: ["エスコンフィールド"], station: "北広島", area: "北海道" },
  { name: "国立競技場", aliases: ["新国立競技場", "MUFGスタジアム"], station: "国立競技場", area: "東京" },
  { name: "日産スタジアム", aliases: [], station: "新横浜", area: "神奈川" },
  { name: "味の素スタジアム", aliases: ["味スタ"], station: "飛田給", area: "東京" },
  { name: "ヤンマースタジアム長居", aliases: ["長居スタジアム"], station: "長居", area: "大阪" },
  { name: "阪神甲子園球場", aliases: ["甲子園"], station: "甲子園", area: "兵庫" },
  { name: "ZOZOマリンスタジアム", aliases: ["ZOZOマリン"], station: "海浜幕張", area: "千葉" },
  { name: "横浜スタジアム", aliases: ["ハマスタ"], station: "関内", area: "神奈川" },
  { name: "さいたまスーパーアリーナ", aliases: ["たまアリ"], station: "さいたま新都心", area: "埼玉" },
  { name: "横浜アリーナ", aliases: ["横アリ"], station: "新横浜", area: "神奈川" },
  { name: "Kアリーナ横浜", aliases: ["Kアリーナ", "K-Arena"], station: "新高島", area: "神奈川" },
  { name: "ぴあアリーナMM", aliases: ["ぴあアリーナ"], station: "みなとみらい", area: "神奈川" },
  { name: "横浜BUNTAI", aliases: ["BUNTAI"], station: "関内", area: "神奈川" },
  { name: "日本武道館", aliases: ["武道館"], station: "九段下", area: "東京" },
  { name: "有明アリーナ", aliases: [], station: "有明", area: "東京" },
  { name: "国立代々木競技場 第一体育館", aliases: ["代々木第一体育館", "代々木体育館"], station: "原宿", area: "東京" },
  { name: "東京体育館", aliases: [], station: "千駄ケ谷", area: "東京" },
  { name: "両国国技館", aliases: ["国技館"], station: "両国", area: "東京" },
  { name: "京王アリーナTOKYO", aliases: ["武蔵野の森総合スポーツプラザ"], station: "飛田給", area: "東京" },
  { name: "LaLa arena TOKYO-BAY", aliases: ["ららアリーナ"], station: "南船橋", area: "千葉" },
  { name: "幕張メッセ", aliases: [], station: "海浜幕張", area: "千葉" },
  { name: "IGアリーナ", aliases: ["愛知国際アリーナ"], station: "名城公園", area: "愛知" },
  { name: "日本ガイシホール", aliases: ["ガイシホール"], station: "笠寺", area: "愛知" },
  { name: "ポートメッセなごや", aliases: ["ポートメッセ"], station: "金城ふ頭", area: "愛知" },
  { name: "大阪城ホール", aliases: ["城ホール"], station: "大阪城公園", area: "大阪" },
  { name: "Asueアリーナ大阪", aliases: ["丸善インテックアリーナ大阪", "大阪市中央体育館"], station: "朝潮橋", area: "大阪" },
  { name: "おおきにアリーナ舞洲", aliases: ["舞洲アリーナ"], station: "桜島", area: "大阪" },
  { name: "インテックス大阪", aliases: ["インテックス"], station: "中ふ頭", area: "大阪" },
  { name: "GLION ARENA KOBE", aliases: ["ジーライオンアリーナ"], station: "三宮", area: "兵庫" },
  { name: "神戸ワールド記念ホール", aliases: ["ワールド記念ホール"], station: "市民広場", area: "兵庫" },
  { name: "マリンメッセ福岡", aliases: ["マリンメッセ"], station: "博多", area: "福岡" },
  { name: "北海きたえーる", aliases: ["きたえーる"], station: "豊平公園", area: "北海道" },
  { name: "真駒内セキスイハイムアイスアリーナ", aliases: ["真駒内アイスアリーナ"], station: "真駒内", area: "北海道" },
  { name: "セキスイハイムスーパーアリーナ", aliases: ["グランディ21"], station: "利府", area: "宮城" },
  { name: "ゼビオアリーナ仙台", aliases: ["ゼビオアリーナ"], station: "長町", area: "宮城" },
  { name: "広島グリーンアリーナ", aliases: ["グリーンアリーナ"], station: "県庁前", area: "広島" },
  { name: "エコパアリーナ", aliases: ["静岡エコパ"], station: "愛野", area: "静岡" },
  { name: "東京ガーデンシアター", aliases: ["ガーデンシアター"], station: "国際展示場", area: "東京" },
  { name: "東京国際フォーラム", aliases: ["国際フォーラム"], station: "有楽町", area: "東京" },
  { name: "東京ドームシティホール", aliases: ["TDCホール", "ドームシティホール"], station: "水道橋", area: "東京" },
  { name: "東京ビッグサイト", aliases: ["ビッグサイト"], station: "国際展示場", area: "東京" },
  { name: "NHKホール", aliases: [], station: "渋谷", area: "東京" },
  { name: "日本青年館ホール", aliases: ["日本青年館"], station: "外苑前", area: "東京" },
  { name: "立川ステージガーデン", aliases: [], station: "立川", area: "東京" },
  { name: "パシフィコ横浜", aliases: ["パシフィコ"], station: "みなとみらい", area: "神奈川" },
  { name: "Zepp Haneda", aliases: ["Zepp羽田"], station: "天空橋", area: "東京" },
  { name: "Zepp DiverCity", aliases: ["Zeppダイバーシティ"], station: "東京テレポート", area: "東京" },
  { name: "Zepp Osaka Bayside", aliases: ["Zeppベイサイド"], station: "桜島", area: "大阪" },
  { name: "Zepp Nagoya", aliases: ["Zepp名古屋"], station: "ささしまライブ", area: "愛知" },
  { name: "Zepp Fukuoka", aliases: ["Zepp福岡"], station: "唐人町", area: "福岡" },
  { name: "Zepp Sapporo", aliases: ["Zepp札幌"], station: "すすきの", area: "北海道" },
];

/** 照合キー（会場名・別名）を長い順に並べ、「東京ドームシティホール」が「東京ドーム」に誤一致しないようにする */
const KEYS = VENUES.flatMap((v) => [v.name, ...v.aliases].map((key) => ({ key: key.toLowerCase(), v }))).sort((a, b) => b.key.length - a.key.length);

export function matchVenue(text: string): { name: string; station: string } | null {
  const t = text.toLowerCase();
  const hit = KEYS.find(({ key }) => t.includes(key));
  return hit ? { name: hit.v.name, station: hit.v.station } : null;
}
