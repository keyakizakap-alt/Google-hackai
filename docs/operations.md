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
| 道具の使わせ方 | `GEMINI_TOOL_MODE`（既定 `AUTO`。`VALIDATED`・`ANY` も選べるが、`ANY` は Vertex AI の gemini-3.5-flash で 400 になることを確認） |
| AI が考える深さ（応答の速さ） | `GEMINI_THINKING_LEVEL`（既定 `LOW`。プラン作成・ライブやスクショの読み取り・検索で共通。`MEDIUM`・`HIGH` にすると丁寧になるが遅くなる） |
| AI 呼び出しの 1 日の上限 | `AGENT_DAILY_LIMIT` |
| Google 検索（実在の店・宿・便と参考価格を探す） | `GEMINI_WEB_SEARCH`（既定はオン。`off` で止める。検索の呼び出しは 1 回のプラン作成で最大 3 回。課金は Google 側で実行された検索クエリの数で数え、1 回の呼び出しで複数のクエリが走ることがある（公式ドキュメント・2026-10-13 時点）） |
| 駅すぱあとで使うツール | `EKISPERT_ALLOWED_TOOLS` |
| アプリの公開 URL | `APP_BASE_URL`（Vercel では未設定でも本番ドメインを自動で使用） |
| IP の取り出し位置（Cloud Run 等） | `TRUSTED_PROXY_HOPS` |

予約リンクとして表示してよいサイトは、安全のためコード（`src/lib/safeUrl.ts`）で管理しています。追加するときはレビューを通してください。

## 成功率・速さ・費用を集計する

トークン数・AI の呼び出し回数と時間・失敗の理由はログに記録している。集計の SQL とグラフの作り方は [可観測性](observability.md) を参照。

## AI に接続できないとき（プランが作れない）

ログ エクスプローラで次を検索し、行の `httpStatus`・`apiStatus`・`apiReason` を見る（サービス名は自分の環境に合わせる）。

```
resource.type="cloud_run_revision"
resource.labels.service_name="google-hackai"
jsonPayload.message="agent.gemini.failed"
```

| `apiReason` / `apiStatus` | 原因 | 直し方 |
|---|---|---|
| `SERVICE_DISABLED` | `GOOGLE_CLOUD_PROJECT` のプロジェクトで Vertex AI API が無効 | そのプロジェクトで Vertex AI API を有効にする。`GOOGLE_CLOUD_PROJECT` が意図したプロジェクト ID か確認する |
| `BILLING_DISABLED` | 課金が紐づいていない | 「お支払い」で請求先アカウントを紐づける |
| `IAM_PERMISSION_DENIED` / `PERMISSION_DENIED` | 実行用サービスアカウントに権限がない | 「セキュリティ」タブに表示されるサービスアカウントに `roles/aiplatform.user` を付ける |
| `CONSUMER_INVALID` / `USER_PROJECT_DENIED` | プロジェクト ID の誤り（存在しない・番号や表示名を入れている） | `GOOGLE_CLOUD_PROJECT` を英小文字のプロジェクト ID にする |
| `INVALID_ARGUMENT`（`httpStatus` 400） | 送ったリクエストの形がモデルに受け付けられなかった（コードかモデル設定の問題） | アプリが自動で互換モードに切り替えて作り直す（1: 駅すぱあと・考える深さを外す、2: 引数定義を従来の形式にする）。`agent.gemini.compat_ok` の `mode`（`compat-1` / `compat-2`）で、どの段階で通ったか分かる。`apiField`・`apiMessage` に不正な項目が出ることもある |
| `NOT_FOUND`（`httpStatus` 404） | モデル名・場所の誤り | `GEMINI_MODEL` と `GOOGLE_CLOUD_LOCATION`（`global`）を確認する |
| `RESOURCE_EXHAUSTED`（429） | 利用枠の不足・混雑 | 少し待つ。`GEMINI_FALLBACK_MODEL` を設定する |
| `mode` が `timeout`（`errorCode` が `AgentDeadlineError` / `TimeoutError`） | AI の応答が遅く、制限時間（120 秒。1 回の呼び出しは 45 秒）内に仕上がらなかった。利用者には決まった手順で組み立てたプランを返している（`agent.completed` の `mode` が `rule-based`） | `GEMINI_THINKING_LEVEL` を `LOW`（既定）か `MINIMAL` にする。`agent.model.turn` の `latencyMs` で 1 回ごとの時間を確かめる |

ログには理由の名前だけを残し、エラーの説明文（プロジェクト名などを含む）は出さない。入力の誤り（400）のときだけ、不正な項目名と短い説明文（URL を除く）を残す。

画面には、理由の種類・状態コード・問い合わせ番号などの開発者向けの情報は出さない（利用者には「少し時間をおいて、もう一度」と、登録したライブが消えていないことだけを伝える）。原因は、ここに書いたログで確かめる。

自動で作るプラン（ライブを登録した直後など）は、時間切れ・混雑・通信の切断のような一時的な失敗なら、画面側で 3 秒待って 1 回だけ自動でやり直す。権限・設定の誤り（上の表の `SERVICE_DISABLED` など）はやり直さない。

## Google カレンダーが読めないとき（`calendar.busy`）

`jsonPayload.message="calendar.busy"` は、Calendar API が混み合っている（回数の制限・5xx）か、10 秒以内に応答しなかったときに出る。利用者には「少し時間をおいて」と伝え、プラン作成はカレンダーの予定なしで続ける（プランに「カレンダーの予定を読み込めなかったため、重なりは確認できていません」と注意書きが付く。ログは `plan.calendar_unavailable`）。予定がとても多いカレンダーは、上限のページまでで打ち切って続ける（`*.truncated`）。

## ライブの取り込みが遅い・`detect.gemini.failed` が出るとき

`jsonPayload.message="detect.gemini.failed"` で、`apiStatus` が `DEADLINE_EXCEEDED`（`httpStatus` 504）なら、AI の読み取りが時間切れになっている。読み取りは再試行・予備のモデルも含めて全体 20 秒で打ち切り、ルールで読み取った結果で取り込みを続けるので、ライブの登録は止まらない（アーティスト名・会場名の精度が少し下がる）。続くときは `GEMINI_THINKING_LEVEL` が `LOW`（既定）か `MINIMAL` になっているか確かめる。

## Google 検索が使えないとき（店名・便・価格が出ない）

ログ エクスプローラで `jsonPayload.message="agent.web_search.failed"` を検索し、`httpStatus`・`errorCode` を見る。検索に失敗しても、プランは店名・価格を出さない形で作られる（利用者には「見つかりませんでした」と出る）。
`jsonPayload.message="agent.web_search"` は成功した検索 1 回ごとの記録で、`itemCount` が出典の数。検索語は記録しない（出発駅などを含みうるため）。
権限・課金の失敗は、プラン作成の「AI に接続できないとき」と同じ原因（Vertex AI API・課金・権限）を確かめる。費用を止めたいときは `GEMINI_WEB_SEARCH=off`。

### 互換モードでも 400 のとき（部品ごとの切り分け）

互換モードの 3 段階すべてで拒否されると、アプリはリクエストを部品ごとに分けて順に送り、結果を `agent.gemini.probe` に残す（インスタンスごとに 10 分に 1 回まで）。`mode` が部品の名前、`toolOk` が成否。

| `mode` | 送る内容 | ここで初めて失敗したら |
|---|---|---|
| `text_only` | 短い文だけ | モデル・プロジェクト・場所の問題（コンソールでの試験と比べる） |
| `system` | ＋アプリの指示（システム指示） | システム指示の内容 |
| `user_prompt` | 利用者の依頼文だけ | 依頼文の内容 |
| `tools_legacy` | ＋道具の定義（従来の形式） | 道具の定義（名前・説明・引数） |
| `tools_json` | ＋道具の定義（JSON Schema 形式） | JSON Schema 形式の書き方 |
| `tools_any` | ＋「必ず道具を使う」指定 | Function Calling の `mode: ANY`（2026-10 に本番で確認。既定では送らない） |
| `tools_validated` | ＋`mode: VALIDATED` | `VALIDATED` の指定 |
| `full` | 全部入り（使わせ方の指定は `GEMINI_TOOL_MODE` どおり） | 部品の組み合わせ |
