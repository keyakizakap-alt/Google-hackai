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
| AI が考える深さ（応答の速さ） | `GEMINI_THINKING_LEVEL`（既定 `LOW`。`MEDIUM`・`HIGH` にすると丁寧になるが遅くなる） |
| AI 呼び出しの 1 日の上限 | `AGENT_DAILY_LIMIT` |
| 駅すぱあとで使うツール | `EKISPERT_ALLOWED_TOOLS` |
| アプリの公開 URL | `APP_BASE_URL`（Vercel では未設定でも本番ドメインを自動で使用） |
| IP の取り出し位置（Cloud Run 等） | `TRUSTED_PROXY_HOPS` |

予約リンクとして表示してよいサイトは、安全のためコード（`src/lib/safeUrl.ts`）で管理しています。追加するときはレビューを通してください。

## AI に接続できないとき（プランが作れない）

ログ エクスプローラで次を検索し、行の `httpStatus`・`apiStatus`・`apiReason` を見る（サービス名は自分の環境に合わせる）。

```
resource.type="cloud_run_revision"
resource.labels.service_name="oshiready"
jsonPayload.message="agent.gemini.failed"
```

| `apiReason` / `apiStatus` | 原因 | 直し方 |
|---|---|---|
| `SERVICE_DISABLED` | `GOOGLE_CLOUD_PROJECT` のプロジェクトで Vertex AI API が無効 | そのプロジェクトで Vertex AI API を有効にする。`GOOGLE_CLOUD_PROJECT` が意図したプロジェクト ID か確認する |
| `BILLING_DISABLED` | 課金が紐づいていない | 「お支払い」で請求先アカウントを紐づける |
| `IAM_PERMISSION_DENIED` / `PERMISSION_DENIED` | 実行用サービスアカウントに権限がない | 「セキュリティ」タブに表示されるサービスアカウントに `roles/aiplatform.user` を付ける |
| `CONSUMER_INVALID` / `USER_PROJECT_DENIED` | プロジェクト ID の誤り（存在しない・番号や表示名を入れている） | `GOOGLE_CLOUD_PROJECT` を英小文字のプロジェクト ID にする |
| `INVALID_ARGUMENT`（`httpStatus` 400） | 送ったリクエストの形がモデルに受け付けられなかった（コードかモデル設定の問題） | `apiField`・`apiMessage` に不正な項目が出る。考える深さが原因なら `GEMINI_THINKING_LEVEL=default` で外して確かめる。それ以外は開発者に連絡する |
| `NOT_FOUND`（`httpStatus` 404） | モデル名・場所の誤り | `GEMINI_MODEL` と `GOOGLE_CLOUD_LOCATION`（`global`）を確認する |
| `RESOURCE_EXHAUSTED`（429） | 利用枠の不足・混雑 | 少し待つ。`GEMINI_FALLBACK_MODEL` を設定する |
| `mode` が `timeout`（`errorCode` が `AgentDeadlineError` / `TimeoutError`） | AI の応答が遅く、制限時間（約 110 秒）内に仕上がらなかった | `GEMINI_THINKING_LEVEL` を `LOW`（既定）か `MINIMAL` にする。`agent.model.turn` の `latencyMs` で 1 回ごとの時間を確かめる |

ログには理由の名前だけを残し、エラーの説明文（プロジェクト名などを含む）は出さない。入力の誤り（400）のときだけ、不正な項目名と短い説明文（URL を除く）を残す。
