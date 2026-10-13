import { MS_MIN } from "../time";

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
