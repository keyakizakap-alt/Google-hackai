/**
 * 主要ライブ会場 → 最寄り駅の辞書（一般的に知られた最寄り駅。公式アクセス情報で要確認）。
 * カレンダーの場所欄やタイトルから会場を特定し、移動プランの目的地に使う。
 */
export const VENUES: { name: string; aliases: string[]; station: string }[] = [
  { name: "京セラドーム大阪", aliases: ["京セラドーム", "京セラD", "大阪ドーム"], station: "ドーム前千代崎" },
  { name: "東京ドーム", aliases: ["東京D", "Tokyo Dome"], station: "水道橋" },
  { name: "バンテリンドーム ナゴヤ", aliases: ["バンテリンドーム", "ナゴヤドーム"], station: "ナゴヤドーム前矢田" },
  { name: "みずほPayPayドーム福岡", aliases: ["PayPayドーム", "福岡ドーム"], station: "唐人町" },
  { name: "ベルーナドーム", aliases: ["西武ドーム"], station: "西武球場前" },
  { name: "さいたまスーパーアリーナ", aliases: ["たまアリ", "SSA"], station: "さいたま新都心" },
  { name: "横浜アリーナ", aliases: ["横アリ"], station: "新横浜" },
  { name: "Kアリーナ横浜", aliases: ["Kアリーナ", "K-Arena"], station: "新高島" },
  { name: "ぴあアリーナMM", aliases: ["ぴあアリーナ"], station: "みなとみらい" },
  { name: "日本武道館", aliases: ["武道館"], station: "九段下" },
  { name: "有明アリーナ", aliases: [], station: "有明" },
  { name: "東京ガーデンシアター", aliases: ["ガーデンシアター"], station: "国際展示場" },
  { name: "国立代々木競技場 第一体育館", aliases: ["代々木第一体育館", "代々木体育館"], station: "原宿" },
  { name: "東京国際フォーラム", aliases: ["国際フォーラム"], station: "有楽町" },
  { name: "幕張メッセ", aliases: [], station: "海浜幕張" },
  { name: "大阪城ホール", aliases: ["城ホール"], station: "大阪城公園" },
  { name: "日産スタジアム", aliases: [], station: "新横浜" },
  { name: "神戸ワールド記念ホール", aliases: ["ワールド記念ホール"], station: "市民広場" },
];

export function matchVenue(text: string): { name: string; station: string } | null {
  const t = text.toLowerCase();
  for (const v of VENUES) {
    for (const key of [v.name, ...v.aliases]) {
      if (t.includes(key.toLowerCase())) return { name: v.name, station: v.station };
    }
  }
  return null;
}
