import type { TimelineItem } from "../agent/types";

/**
 * アプリ内で予約する対象か（美容・交通・宿泊だけ）。「経路を確認」などの確認項目は予約せず案内する。
 * 画面の件数表示とサーバーの予約処理で同じ判定を使い、表示と実際の動きをそろえる。
 */
export const isInAppBookable = (item: TimelineItem): boolean =>
  item.requiresBooking && (item.kind === "beauty" || item.kind === "transit" || item.kind === "stay");
