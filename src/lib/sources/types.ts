import type { CalendarItemForDetection } from "../eventDetection/detect";
import type { BusyBlock } from "../privacy/mask";

/**
 * カレンダー連携の「部品（アダプタ）」が守る共通の約束。
 *
 * 連携先（Google・Outlook など）が増えたり、提供が終わったりしても、
 * このインターフェースを実装したファイルを 1 つ足す／外すだけで対応できるようにする。
 * 予定データは必ず gate.ts（共通の安全チェック）を通してからアプリに渡る。
 */
export interface CalendarSourceAdapter {
  /** 識別子（環境変数 CALENDAR_SOURCES で有効化するときの名前） */
  id: string;
  /** 画面に出す名前 */
  label: string;
  /** 連携を始めるURL（OAuth の開始など）。不要なら null */
  connectPath: string | null;
  /** サーバー側の設定（クライアントID等）がそろっているか */
  isAvailable(): boolean;
  /** このブラウザの利用者が連携済みか */
  isConnected(): Promise<boolean>;
  /**
   * 空き時間計算用。**時間帯だけ**を返すこと（タイトル等は返さない）。
   * 念のため gate 側でも時間帯以外の項目は捨てる。
   */
  fetchBusy(range: { from: number; to: number }): Promise<BusyBlock[]>;
  /**
   * ライブ検出用の予定（タイトル・場所・日時のみ）。
   * 受け取った gate がすぐにライブ候補だけに絞り、残りは破棄する。
   */
  fetchItemsForDetection(range: { from: number; to: number }): Promise<CalendarItemForDetection[]>;
  /** 連携解除（先方の許可の取り消しを含む） */
  disconnect(): Promise<void>;
}
