import { MS_MIN, toJstIso } from "../time";

/**
 * 駅すぱあと API が未設定のときに使う経路モック。
 * 長崎 → 京セラドーム大阪 のデモ用に、実在路線の構成を参考にした所要時間の概算を返す（参考値）。
 */
export interface MockRoute {
  from: string;
  to: string;
  departure: string;
  arrival: string;
  durationMin: number;
  transfers: number;
  fareJpy: number;
  summary: string;
  legs: { line: string; from: string; to: string; departure: string; arrival: string }[];
  source: "mock";
  disclaimer: string;
}

const LEGS_NAGASAKI_TO_DOME = [
  { line: "西九州新幹線 かもめ", from: "長崎", to: "武雄温泉", min: 30, wait: 5 },
  { line: "特急 リレーかもめ", from: "武雄温泉", to: "博多", min: 65, wait: 15 },
  { line: "山陽新幹線 のぞみ", from: "博多", to: "新大阪", min: 150, wait: 10 },
  { line: "Osaka Metro 御堂筋線", from: "新大阪", to: "心斎橋", min: 15, wait: 8 },
  { line: "Osaka Metro 長堀鶴見緑地線", from: "心斎橋", to: "ドーム前千代崎", min: 5, wait: 0 },
];

export function mockRoute(params: { from: string; to: string; arriveBy: string }): MockRoute {
  const arriveBy = Date.parse(params.arriveBy);
  const legs = LEGS_NAGASAKI_TO_DOME;
  const total = legs.reduce((a, l) => a + l.min + l.wait, 0);
  let t = arriveBy - total * MS_MIN;
  // 15 分単位に切り下げ
  t = Math.floor(t / (15 * MS_MIN)) * 15 * MS_MIN;
  const departure = t;
  const out: MockRoute["legs"] = [];
  for (const l of legs) {
    const dep = t;
    const arr = t + l.min * MS_MIN;
    out.push({ line: l.line, from: l.from, to: l.to, departure: toJstIso(dep), arrival: toJstIso(arr) });
    t = arr + l.wait * MS_MIN;
  }
  const arrival = Date.parse(out[out.length - 1].arrival);
  return {
    from: params.from,
    to: params.to,
    departure: toJstIso(departure),
    arrival: toJstIso(arrival),
    durationMin: Math.round((arrival - departure) / MS_MIN),
    transfers: legs.length - 1,
    fareJpy: 19000,
    summary: `${params.from} → ${legs.map((l) => l.to).join(" → ")}`,
    legs: out,
    source: "mock",
    disclaimer: "駅すぱあと API 未接続のため概算のモックです。実際の時刻・運賃は必ず確認してください。",
  };
}

/**
 * 会場周辺の混雑度推定（ヒューリスティック）。
 * 大規模公演では開演 2 時間前〜開演 30 分前が最も混雑しやすい、という一般的傾向に基づく。
 */
export function estimateCrowd(params: { eventStart: string; at: string }) {
  const diffMin = (Date.parse(params.eventStart) - Date.parse(params.at)) / MS_MIN;
  let level: "low" | "medium" | "high" = "low";
  if (diffMin <= 120 && diffMin >= 20) level = "high";
  else if ((diffMin > 120 && diffMin <= 240) || (diffMin < 20 && diffMin >= -30)) level = "medium";
  return {
    level,
    minutesBeforeStart: Math.round(diffMin),
    advice:
      level === "high"
        ? "最混雑帯です。到着を 1 時間以上前倒しするか、開演直前を避けてください"
        : level === "medium"
          ? "やや混雑。物販に並ぶなら早めの到着が安心です"
          : "比較的空いている時間帯です",
  };
}
