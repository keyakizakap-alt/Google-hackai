# 運用メモ（設定の変更・秘密の値の入れ替え）

## 秘密の値（SESSION_SECRET）の入れ替え

`SESSION_SECRET` は、プランの署名と Google 連携情報の暗号化に使います。
値が漏れた可能性があるときや、定期的に入れ替えるときは、次の手順で**利用中の人を締め出さずに**安全に入れ替えられます。

1. 新しい値を用意します（32 文字以上のランダムな文字列。パスワード生成ツールなどで作成）。
2. Vercel（または Cloud Run の Secret Manager）で、次のように設定します。
   - `SESSION_SECRET` … 新しい値
   - `SESSION_SECRET_PREVIOUS` … これまでの値
3. 再デプロイします。以後の暗号化・署名は新しい値で行われ、古い値で作られたものも読めます。
4. 24 時間後（連携情報の Cookie の有効期限）に `SESSION_SECRET_PREVIOUS` を削除し、再デプロイします。

**値が漏れた可能性がある場合**は、手順 2 で `SESSION_SECRET_PREVIOUS` を設定しないでください。古い値で作られたものは即座に無効になります。その場合、利用者は Google 連携をやり直すことになります。

> 秘密の値は、チャット・Issue・ログなどに貼り付けないでください。

## 変更しやすい設定（環境変数）

| 変えたいこと | 環境変数 |
|---|---|
| 連携するカレンダー | `CALENDAR_SOURCES` |
| AI のモデル | `GEMINI_MODEL` |
| AI 呼び出しの 1 日の上限 | `AGENT_DAILY_LIMIT` |
| 駅すぱあとで使うツール | `EKISPERT_ALLOWED_TOOLS` |
| アプリの公開 URL | `APP_BASE_URL`（Vercel では未設定でも本番ドメインを自動で使用） |
| IP の取り出し位置（Cloud Run 等） | `TRUSTED_PROXY_HOPS` |

予約リンクとして表示してよいサイトは、安全のためコード（`src/lib/safeUrl.ts`）で管理しています。追加するときはレビューを通してください。
