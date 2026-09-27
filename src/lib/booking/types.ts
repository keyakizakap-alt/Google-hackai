import type { TimelineItem } from "../agent/types";

/**
 * 予約の「部品（プロバイダー）」が守る共通の約束。
 *
 * 予約サイトと提携して予約 API が使えるようになったら、この約束を満たす部品を 1 つ足して
 * 環境変数 BOOKING_PROVIDERS に名前を加えるだけで、アプリ内の予約・キャンセルが本物になる。
 * 部品が呼ばれるのは、ユーザーがアプリ内で承認・確認した後だけ（AI エージェントには渡さない）。
 */
export interface BookingProvider {
  id: string;
  /** 画面に出す名前 */
  label: string;
  /** 実在の店舗・交通機関には届かない練習用の予約なら true（画面に必ず明記する） */
  demo: boolean;
  /** この項目を予約できるか */
  supports(item: TimelineItem): boolean;
  /** 予約する。返す ref はキャンセル時にだけ使う（利用者には見せない） */
  reserve(item: TimelineItem): Promise<{ confirmationNo: string; ref: string }>;
  /** キャンセルする */
  cancel(ref: string): Promise<void>;
}
