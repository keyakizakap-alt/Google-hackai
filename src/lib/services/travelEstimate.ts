import { venueArea } from "../eventDetection/venues";
import { MS_MIN, toJstIso } from "../time";

/**
 * 乗り換えの待機系：API を使わない「所要時間の目安」。
 *
 * 駅すぱあと（主系）が使えないときに、AI が移動を逆算できるようにするための部品。
 * 全国を主な拠点（ハブ）にまとめ、「出発地 → 拠点 → 拠点 → 会場」の所要時間を足し合わせる。
 *
 * 値はすべて、一般に知られた代表的な所要時間（新幹線・特急・飛行機の速い便）をもとにした**目安**で、
 * 乗り換え・空港の手続き・待ち時間をおおまかに含む。公式の時刻表で確かめたものではない（未検証を含む）。
 * 列車名・発着時刻・運賃は返さない。画面でも「目安」と明記し、検索リンクで確かめてもらう。
 */

type Hub = "札幌" | "仙台" | "新潟" | "東京" | "金沢" | "名古屋" | "大阪" | "岡山" | "広島" | "高松" | "福岡" | "鹿児島" | "那覇";
type Mode = "新幹線" | "特急" | "飛行機";

/** 都道府県 → 最寄りの拠点と、県の中心から拠点までの目安（分） */
const PREF_TO_HUB: Record<string, { hub: Hub; access: number }> = {
  北海道: { hub: "札幌", access: 0 },
  青森: { hub: "仙台", access: 90 }, 岩手: { hub: "仙台", access: 45 }, 宮城: { hub: "仙台", access: 0 },
  秋田: { hub: "仙台", access: 150 }, 山形: { hub: "仙台", access: 70 }, 福島: { hub: "仙台", access: 30 },
  茨城: { hub: "東京", access: 70 }, 栃木: { hub: "東京", access: 50 }, 群馬: { hub: "東京", access: 60 },
  埼玉: { hub: "東京", access: 30 }, 千葉: { hub: "東京", access: 40 }, 東京: { hub: "東京", access: 0 }, 神奈川: { hub: "東京", access: 30 },
  新潟: { hub: "新潟", access: 0 }, 富山: { hub: "金沢", access: 25 }, 石川: { hub: "金沢", access: 0 }, 福井: { hub: "金沢", access: 30 },
  山梨: { hub: "東京", access: 90 }, 長野: { hub: "東京", access: 90 },
  岐阜: { hub: "名古屋", access: 25 }, 静岡: { hub: "東京", access: 70 }, 愛知: { hub: "名古屋", access: 0 }, 三重: { hub: "名古屋", access: 50 },
  滋賀: { hub: "大阪", access: 45 }, 京都: { hub: "大阪", access: 30 }, 大阪: { hub: "大阪", access: 0 }, 兵庫: { hub: "大阪", access: 30 },
  奈良: { hub: "大阪", access: 40 }, 和歌山: { hub: "大阪", access: 70 },
  鳥取: { hub: "岡山", access: 120 }, 島根: { hub: "岡山", access: 160 }, 岡山: { hub: "岡山", access: 0 }, 広島: { hub: "広島", access: 0 },
  山口: { hub: "広島", access: 60 },
  徳島: { hub: "高松", access: 70 }, 香川: { hub: "高松", access: 0 }, 愛媛: { hub: "高松", access: 150 }, 高知: { hub: "高松", access: 150 },
  福岡: { hub: "福岡", access: 0 }, 佐賀: { hub: "福岡", access: 40 }, 長崎: { hub: "福岡", access: 90 }, 熊本: { hub: "福岡", access: 40 },
  大分: { hub: "福岡", access: 130 }, 宮崎: { hub: "鹿児島", access: 130 }, 鹿児島: { hub: "鹿児島", access: 0 }, 沖縄: { hub: "那覇", access: 0 },
};

/** 拠点どうしの目安（分）と主な手段。片方向だけ書き、逆向きは同じ値を使う */
const HUB_LINKS: [Hub, Hub, number, Mode][] = [
  ["東京", "仙台", 95, "新幹線"], ["東京", "札幌", 230, "飛行機"], ["東京", "新潟", 120, "新幹線"], ["東京", "金沢", 155, "新幹線"],
  ["東京", "名古屋", 100, "新幹線"], ["東京", "大阪", 150, "新幹線"], ["東京", "岡山", 200, "新幹線"], ["東京", "広島", 240, "新幹線"],
  ["東京", "高松", 270, "新幹線"], ["東京", "福岡", 220, "飛行機"], ["東京", "鹿児島", 240, "飛行機"], ["東京", "那覇", 270, "飛行機"],
  ["仙台", "札幌", 200, "飛行機"], ["仙台", "新潟", 190, "新幹線"], ["仙台", "金沢", 270, "新幹線"], ["仙台", "名古屋", 210, "新幹線"],
  ["仙台", "大阪", 250, "新幹線"], ["仙台", "岡山", 300, "新幹線"], ["仙台", "広島", 340, "新幹線"], ["仙台", "高松", 360, "新幹線"],
  ["仙台", "福岡", 240, "飛行機"], ["仙台", "鹿児島", 270, "飛行機"], ["仙台", "那覇", 300, "飛行機"],
  ["札幌", "新潟", 200, "飛行機"], ["札幌", "金沢", 270, "飛行機"], ["札幌", "名古屋", 240, "飛行機"], ["札幌", "大阪", 240, "飛行機"],
  ["札幌", "岡山", 270, "飛行機"], ["札幌", "広島", 300, "飛行機"], ["札幌", "高松", 300, "飛行機"], ["札幌", "福岡", 270, "飛行機"],
  ["札幌", "鹿児島", 330, "飛行機"], ["札幌", "那覇", 330, "飛行機"],
  ["新潟", "金沢", 210, "特急"], ["新潟", "名古屋", 240, "新幹線"], ["新潟", "大阪", 270, "飛行機"], ["新潟", "岡山", 330, "新幹線"],
  ["新潟", "広島", 360, "新幹線"], ["新潟", "高松", 360, "新幹線"], ["新潟", "福岡", 240, "飛行機"], ["新潟", "鹿児島", 300, "飛行機"],
  ["新潟", "那覇", 330, "飛行機"],
  ["金沢", "名古屋", 175, "特急"], ["金沢", "大阪", 160, "特急"], ["金沢", "岡山", 220, "特急"], ["金沢", "広島", 270, "特急"],
  ["金沢", "高松", 290, "特急"], ["金沢", "福岡", 300, "飛行機"], ["金沢", "鹿児島", 330, "飛行機"], ["金沢", "那覇", 330, "飛行機"],
  ["名古屋", "大阪", 55, "新幹線"], ["名古屋", "岡山", 100, "新幹線"], ["名古屋", "広島", 140, "新幹線"], ["名古屋", "高松", 170, "新幹線"],
  ["名古屋", "福岡", 200, "新幹線"], ["名古屋", "鹿児島", 280, "新幹線"], ["名古屋", "那覇", 240, "飛行機"],
  ["大阪", "岡山", 50, "新幹線"], ["大阪", "広島", 85, "新幹線"], ["大阪", "高松", 120, "新幹線"], ["大阪", "福岡", 150, "新幹線"],
  ["大阪", "鹿児島", 230, "新幹線"], ["大阪", "那覇", 240, "飛行機"],
  ["岡山", "広島", 40, "新幹線"], ["岡山", "高松", 55, "特急"], ["岡山", "福岡", 110, "新幹線"], ["岡山", "鹿児島", 190, "新幹線"],
  ["岡山", "那覇", 270, "飛行機"],
  ["広島", "高松", 110, "新幹線"], ["広島", "福岡", 65, "新幹線"], ["広島", "鹿児島", 150, "新幹線"], ["広島", "那覇", 240, "飛行機"],
  ["高松", "福岡", 170, "新幹線"], ["高松", "鹿児島", 250, "新幹線"], ["高松", "那覇", 270, "飛行機"],
  ["福岡", "鹿児島", 80, "新幹線"], ["福岡", "那覇", 210, "飛行機"], ["鹿児島", "那覇", 200, "飛行機"],
];

/**
 * 主な手段とは別に、もう一方の手段も現実的な区間（新幹線と飛行機のどちらも選ばれる区間）。
 * 飛行機は空港までの移動・保安検査の待ちを含めた目安。AI はどちらで着くかを比べて選べる
 */
const ALT_LINKS: [Hub, Hub, number, Mode][] = [
  ["東京", "大阪", 180, "飛行機"], ["東京", "岡山", 200, "飛行機"], ["東京", "広島", 210, "飛行機"], ["東京", "高松", 200, "飛行機"],
  ["東京", "金沢", 180, "飛行機"], ["仙台", "大阪", 190, "飛行機"], ["名古屋", "福岡", 190, "飛行機"], ["新潟", "名古屋", 190, "飛行機"],
  ["東京", "福岡", 300, "新幹線"], ["札幌", "仙台", 300, "新幹線"],
];

/** 拠点の空港（飛行機の便を探すとき・Google フライトのリンクに使う） */
const HUB_AIRPORT: Record<Hub, string> = {
  札幌: "新千歳空港", 仙台: "仙台空港", 新潟: "新潟空港", 東京: "羽田空港", 金沢: "小松空港", 名古屋: "中部国際空港",
  大阪: "伊丹空港", 岡山: "岡山空港", 広島: "広島空港", 高松: "高松空港", 福岡: "福岡空港", 鹿児島: "鹿児島空港", 那覇: "那覇空港",
};
/** 拠点とは別に、自前の空港がある県（その県から出発・到着するときはこちらの空港を候補にする） */
const PREF_AIRPORT: Record<string, string> = {
  青森: "青森空港", 岩手: "いわて花巻空港", 秋田: "秋田空港", 山形: "山形空港", 富山: "富山空港", 鳥取: "米子空港", 島根: "出雲空港",
  山口: "山口宇部空港", 徳島: "徳島空港", 愛媛: "松山空港", 高知: "高知龍馬空港", 佐賀: "佐賀空港", 長崎: "長崎空港", 熊本: "熊本空港",
  大分: "大分空港", 宮崎: "宮崎空港",
};
const airportOf = (pref: string, hub: Hub) => PREF_AIRPORT[pref] ?? HUB_AIRPORT[hub];

function hubLink(a: Hub, b: Hub): { minutes: number; mode: Mode } | undefined {
  if (a === b) return { minutes: 0, mode: "新幹線" };
  const hit = HUB_LINKS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? { minutes: hit[2], mode: hit[3] } : undefined;
}

/**
 * 主な駅・市の名前 → 都道府県。出発駅は自由入力なので、県庁所在地・新幹線の停車駅・主な市を持つ。
 * 都道府県名そのもの（「長崎」「大阪」など）は PREF_TO_HUB で照合する。
 */
const STATION_TO_PREF: Record<string, string> = {
  札幌: "北海道", 函館: "北海道", 新函館北斗: "北海道", 旭川: "北海道", 小樽: "北海道", 帯広: "北海道", 釧路: "北海道",
  青森: "青森", 新青森: "青森", 八戸: "青森", 盛岡: "岩手", 仙台: "宮城", 秋田: "秋田", 山形: "山形", 福島: "福島", 郡山: "福島",
  水戸: "茨城", つくば: "茨城", 宇都宮: "栃木", 前橋: "群馬", 高崎: "群馬", 大宮: "埼玉", 浦和: "埼玉", さいたま新都心: "埼玉", 川越: "埼玉",
  千葉: "千葉", 船橋: "千葉", 柏: "千葉", 舞浜: "千葉", 東京: "東京", 品川: "東京", 新宿: "東京", 渋谷: "東京", 池袋: "東京", 上野: "東京",
  八王子: "東京", 立川: "東京", 横浜: "神奈川", 新横浜: "神奈川", 川崎: "神奈川", 小田原: "神奈川", 藤沢: "神奈川",
  新潟: "新潟", 長岡: "新潟", 富山: "富山", 金沢: "石川", 福井: "福井", 敦賀: "福井", 甲府: "山梨", 長野: "長野", 松本: "長野",
  岐阜: "岐阜", 静岡: "静岡", 浜松: "静岡", 名古屋: "愛知", 金山: "愛知", 豊橋: "愛知", 津: "三重", 四日市: "三重",
  大津: "滋賀", 京都: "京都", 大阪: "大阪", 新大阪: "大阪", 梅田: "大阪", 難波: "大阪", 天王寺: "大阪",
  神戸: "兵庫", 三ノ宮: "兵庫", 新神戸: "兵庫", 姫路: "兵庫", 西宮: "兵庫", 奈良: "奈良", 和歌山: "和歌山",
  鳥取: "鳥取", 米子: "鳥取", 松江: "島根", 出雲市: "島根", 岡山: "岡山", 倉敷: "岡山", 広島: "広島", 福山: "広島",
  山口: "山口", 新山口: "山口", 下関: "山口", 徳島: "徳島", 高松: "香川", 松山: "愛媛", 高知: "高知",
  福岡: "福岡", 博多: "福岡", 天神: "福岡", 小倉: "福岡", 佐賀: "佐賀", 長崎: "長崎", 佐世保: "長崎", 熊本: "熊本",
  大分: "大分", 別府: "大分", 宮崎: "宮崎", 鹿児島: "鹿児島", 鹿児島中央: "鹿児島", 那覇: "沖縄",
};

/**
 * 同じ道府県の中でも、中心の都市から離れた駅（中心の都市までの目安・分）。
 * 同じ道府県の会場へ行くときだけ使う（別の道府県へは、これらの駅にも空港・新幹線があるため拠点の値を使う）
 */
const STATION_TO_CENTER: Record<string, number> = {
  函館: 210, 新函館北斗: 200, 旭川: 90, 帯広: 160, 釧路: 240, 小樽: 40,
  八王子: 45, 立川: 30, 小田原: 40, 姫路: 45, 豊橋: 50, 浜松: 40, 小倉: 45, 福山: 40,
};
/** 道府県名だけでは場所を絞れないほど広い道府県（同じ道府県の中の目安を出さない） */
const WIDE_PREFS = new Set(["北海道"]);

/** 入力（駅名・市名・都道府県名）を照合する。station は辞書の駅名（都道府県名だけの入力なら undefined） */
function lookup(input: string): { pref: string; station?: string } | undefined {
  const name = input.trim().replace(/駅$/, "");
  if (!name) return undefined;
  // 「京都」「東京」のように末尾が都・府・県の名前もあるので、そのままの形を先に照合する
  for (const n of [name, name.replace(/(都|府|県)$/, "")]) {
    if (STATION_TO_PREF[n]) return { pref: STATION_TO_PREF[n], station: n };
    if (PREF_TO_HUB[n]) return { pref: n };
  }
  // 「JR博多」「博多駅前」のように前後に文字が付いた入力。長い名前から照合する
  const keys = Object.keys(STATION_TO_PREF).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => k.length >= 2 && name.includes(k));
  return hit ? { pref: STATION_TO_PREF[hit], station: hit } : undefined;
}

/** 入力（駅名・市名・都道府県名）から都道府県を推定する。分からなければ undefined */
export function prefectureOf(input: string): string | undefined {
  return lookup(input)?.pref;
}

/** 会場の駅から最寄り駅までの最後の移動（地下鉄・バスなど）の目安（分） */
const LAST_MILE_MIN = 30;
/** 目安の幅（乗り換えの待ち・空港での待ちなどのばらつき） */
const SPREAD = 1.3;

export interface TravelEstimate {
  available: boolean;
  from: string;
  to: string;
  /** 所要時間の目安（分）。[下限, 上限] */
  minutes?: [number, number];
  mode?: string;
  /** 着きたい時刻に間に合う、出発の目安（ISO・JST） */
  departBy?: string;
  summary: string;
  disclaimer: string;
  /** もう一方の手段も現実的なときの目安（例: 新幹線の区間の飛行機） */
  alternatives?: { mode: string; minutes: [number, number]; departBy?: string; summary: string }[];
  /** 飛行機を使う（または候補にある）ときの出発・到着の空港。便を探すとき（search_web）に使う */
  airports?: { from: string; to: string };
}

const DISCLAIMER = "所要時間はアプリ内の表による目安です（列車・時刻・運賃は調べていません）。乗る電車は検索リンクから必ず確かめてください。";

const round15 = (m: number) => Math.round(m / 15) * 15;
const label = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} 時間${m % 60 ? `${m % 60} 分` : ""}` : `${m} 分`);

/**
 * 出発駅 → 会場の駅の所要時間の目安と、着きたい時刻に間に合う出発の目安を返す。
 * venue（会場名）が分かれば会場の都道府県の判定に使う。
 */
export function estimateTravel(params: { from: string; to: string; venue?: string; arriveBy?: string }): TravelEstimate {
  const { from, to } = params;
  const origin = lookup(from);
  const fromPref = origin?.pref;
  const toPref = venueArea(params.venue ?? "", to) ?? prefectureOf(to);
  const unknown = (why: string): TravelEstimate => ({ available: false, from, to, summary: why, disclaimer: DISCLAIMER });
  if (!fromPref) return unknown(`出発駅「${from}」の地域が分からないため、所要時間の目安を出せませんでした`);
  if (!toPref || !PREF_TO_HUB[toPref]) return unknown(`会場の駅「${to}」の地域が分からないため、所要時間の目安を出せませんでした`);

  const o = PREF_TO_HUB[fromPref];
  const d = PREF_TO_HUB[toPref];
  let base: number;
  let mode: string;
  if (fromPref === toPref) {
    // 同じ道府県の中：中心の都市から離れた駅はその分を足す。広い道府県で駅が分からなければ目安を出さない
    if (!origin?.station && WIDE_PREFS.has(fromPref)) return unknown(`「${from}」だけでは${fromPref}のどこから出発するか分からないため、所要時間の目安を出せませんでした。出発駅を入れてください`);
    const extra = origin?.station ? (STATION_TO_CENTER[origin.station] ?? 0) : 0;
    base = 45 + extra;
    mode = extra >= 90 ? "特急" : "在来線・地下鉄";
  } else if (o.hub === d.hub) {
    base = o.access + d.access + LAST_MILE_MIN;
    mode = "在来線・特急";
  } else {
    const link = hubLink(o.hub, d.hub);
    if (!link) return unknown(`「${from}」から「${to}」への所要時間の目安を持っていません`);
    base = o.access + link.minutes + d.access + LAST_MILE_MIN;
    mode = link.mode;
  }
  const arriveBy = params.arriveBy ? Date.parse(params.arriveBy) : NaN;
  const range = (b: number): [number, number] => [round15(b), Math.max(round15(b), round15(b * SPREAD))];
  // 遅い方の見積もりで間に合うように出発する（15 分単位で早めに切り下げる）
  const departFor = (m: [number, number]) => (Number.isFinite(arriveBy) ? toJstIso(Math.floor((arriveBy - m[1] * MS_MIN) / (15 * MS_MIN)) * 15 * MS_MIN) : undefined);
  const minutes = range(base);
  const alternatives =
    o.hub !== d.hub
      ? ALT_LINKS.filter(([x, y]) => (x === o.hub && y === d.hub) || (x === d.hub && y === o.hub)).map(([, , m, altMode]) => {
          const r = range(o.access + m + d.access + LAST_MILE_MIN);
          return { mode: altMode, minutes: r, departBy: departFor(r), summary: `${altMode}なら約 ${label(r[0])}〜${label(r[1])}（目安）` };
        })
      : [];
  const usesAir = mode === "飛行機" || alternatives.some((a) => a.mode === "飛行機");
  return {
    available: true,
    from,
    to,
    minutes,
    mode,
    departBy: departFor(minutes),
    summary: `${from} → ${to}：${mode}で約 ${label(minutes[0])}〜${label(minutes[1])}（目安）`,
    disclaimer: DISCLAIMER,
    ...(alternatives.length ? { alternatives } : {}),
    ...(usesAir && o.hub !== d.hub ? { airports: { from: airportOf(fromPref, o.hub), to: airportOf(toPref, d.hub) } } : {}),
  };
}
