import "server-only";
import { GoogleAuth } from "google-auth-library";
import { CALENDAR_SCOPES } from "./oauth";

/**
 * アプリ自身（Cloud Run の実行サービスアカウント）の権限でカレンダーを読むためのトークン。
 * 鍵ファイルは使わず、Cloud Run のメタデータサーバー（ローカルでは ADC）から取得する。
 * 読めるのは、そのサービスアカウントに共有されたカレンダーだけ。
 */
let auth: GoogleAuth | null = null;

export async function serviceAccountToken(): Promise<string> {
  auth ??= new GoogleAuth({ scopes: CALENDAR_SCOPES });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("service account token unavailable");
  return token;
}
