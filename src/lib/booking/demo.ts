import "server-only";
import { randomBytes } from "node:crypto";
import { randomId } from "../crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 見間違えやすい 0/O・1/I を除く
const code = (n: number) => [...randomBytes(n)].map((b) => CHARS[b % CHARS.length]).join("");
import { isInAppBookable } from "./eligible";
import type { BookingProvider } from "./types";

/**
 * デモ予約。予約番号の発行からキャンセルまで、アプリ内の流れをそのまま体験できる。
 * 実在の店舗・交通機関・宿には一切連絡しない（外部への通信もしない）。
 */
export const demoProvider: BookingProvider = {
  id: "demo",
  label: "デモ予約",
  demo: true,
  supports: isInAppBookable,
  async reserve(item) {
    const prefix = item.kind === "beauty" ? "BT" : item.kind === "stay" ? "ST" : "TR";
    return { confirmationNo: `DEMO-${prefix}-${code(6)}`, ref: `demo:${randomId(8)}` };
  },
  async cancel() {
    /* デモなので取り消す相手はいない */
  },
};
