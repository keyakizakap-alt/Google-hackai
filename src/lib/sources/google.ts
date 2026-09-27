import "server-only";
import { isGoogleOAuthConfigured } from "../config";
import { getBusyBlocks, getItemsForDetection } from "../google/calendar";
import { createOAuthClient } from "../google/oauth";
import { clearTokens, readTokens } from "../session";
import { MS_DAY } from "../time";
import type { CalendarSourceAdapter } from "./types";

/** Google カレンダーの部品（読み取り専用の権限のみを使う） */
export const googleSource: CalendarSourceAdapter = {
  id: "google",
  label: "Google カレンダー",
  connectPath: "/api/auth/google",
  isAvailable: () => isGoogleOAuthConfigured(),
  async isConnected() {
    if (!isGoogleOAuthConfigured()) return false;
    const t = await readTokens();
    return Boolean(t?.access_token || t?.refresh_token);
  },
  async fetchBusy({ to }) {
    const r = await getBusyBlocks({ days: 0, until: to });
    return r.source === "google" ? r.busy : [];
  },
  async fetchItemsForDetection({ from, to }) {
    const r = await getItemsForDetection(Math.max(1, Math.ceil((to - from) / MS_DAY)));
    return r.source === "google" ? r.items : [];
  },
  async disconnect() {
    const t = await readTokens();
    const token = t?.refresh_token ?? t?.access_token;
    try {
      if (token) await createOAuthClient().revokeToken(token);
    } finally {
      await clearTokens();
    }
  },
};
