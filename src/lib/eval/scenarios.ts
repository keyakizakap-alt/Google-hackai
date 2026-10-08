import type { BeautyService, OshiEvent } from "../agent/types";
import type { BusyBlock } from "../privacy/mask";

/**
 * エージェント評価のシナリオ。日付は実行時点からの相対で作る（いつ回しても未来の公演になる）。
 * それぞれ「どこでつまずきやすいか」を狙って用意している。
 */
export interface Scenario {
  id: string;
  /** 何を確かめるシナリオか（レポートに出す） */
  focus: string;
  event: OshiEvent;
  busy: BusyBlock[];
  /** 公演日の天気（評価では気象庁を呼ばずに固定する）。undefined は「予報なし」 */
  forecast?: { sky: "clear" | "cloudy" | "rain" | "snow"; text: string; needsRainGear: boolean };
  instruction?: string;
}

const DAY = 86_400_000;

/** 今日から n 日後の JST 日付（YYYY-MM-DD） */
function jstDate(now: number, n: number): string {
  return new Date(now + n * DAY + 9 * 3_600_000).toISOString().slice(0, 10);
}

const at = (date: string, hm: string) => `${date}T${hm}:00+09:00`;

/** 平日の勤務（9:00〜18:00）を from〜to 日後まで埋める */
function weekdayWork(now: number, from: number, to: number): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (let n = from; n <= to; n++) {
    const date = jstDate(now, n);
    const dow = new Date(`${date}T12:00:00+09:00`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push({ start: at(date, "09:00"), end: at(date, "18:00"), allDay: false, label: "予定あり" });
  }
  return out;
}

function event(now: number, p: { days: number; venue: string; station: string; home: string; beauty: BeautyService[]; goods: boolean; hm?: string }): OshiEvent {
  return {
    id: `eval-${p.venue}`,
    artist: "評価用アーティスト",
    title: `${p.venue} 公演`,
    venue: p.venue,
    venueStation: p.station,
    startAt: at(jstDate(now, p.days), p.hm ?? "18:00"),
    homeStation: p.home,
    beautyServices: p.beauty,
    arriveEarlyForGoods: p.goods,
  };
}

export function buildScenarios(now = Date.now()): Scenario[] {
  return [
    {
      id: "basic",
      focus: "基本：予定の少ない人が近場の公演に行く",
      event: event(now, { days: 14, venue: "京セラドーム大阪", station: "ドーム前千代崎", home: "大阪", beauty: ["hair", "nail"], goods: false }),
      busy: [],
      forecast: undefined,
    },
    {
      id: "busy-worker",
      focus: "平日はフルタイム勤務。美容を夜・週末に入れられるか（予定との重なり）",
      event: event(now, { days: 18, venue: "東京ドーム", station: "水道橋", home: "新宿", beauty: ["hair", "brow", "nail"], goods: true }),
      busy: [
        ...weekdayWork(now, 0, 18),
        { start: at(jstDate(now, 15), "19:00"), end: at(jstDate(now, 15), "21:00"), allDay: false, label: "予定あり" },
        { start: at(jstDate(now, 16), "10:00"), end: at(jstDate(now, 16), "16:00"), allDay: false, label: "予定あり" },
      ],
    },
    {
      id: "rain",
      focus: "公演日が雨予報。濡れ対策をプランに反映できるか",
      event: event(now, { days: 5, venue: "京セラドーム大阪", station: "ドーム前千代崎", home: "京都", beauty: ["hair"], goods: true }),
      busy: weekdayWork(now, 0, 5),
      forecast: { sky: "rain", text: "雨 時々 くもり", needsRainGear: true },
    },
    {
      id: "expedition",
      focus: "東京から福岡へ遠征。物販のため早めに現地入り",
      event: event(now, { days: 21, venue: "みずほPayPayドーム福岡", station: "唐人町", home: "東京", beauty: ["eyelash", "hair"], goods: true, hm: "17:00" }),
      busy: weekdayWork(now, 0, 21),
    },
    {
      id: "tight",
      focus: "公演まで 3 日。推奨タイミングに収まらない中での判断",
      event: event(now, { days: 3, venue: "バンテリンドーム ナゴヤ", station: "ナゴヤドーム前矢田", home: "名古屋", beauty: ["hair", "nail", "eyelash"], goods: false }),
      busy: weekdayWork(now, 0, 3),
    },
    {
      id: "instruction",
      focus: "自然文の要望（眉は土曜の午前）を反映できるか",
      event: event(now, { days: 12, venue: "東京ドーム", station: "水道橋", home: "横浜", beauty: ["brow", "hair"], goods: false }),
      busy: weekdayWork(now, 0, 12),
      instruction: "眉毛サロンは土曜の午前がいいです。",
    },
  ];
}
