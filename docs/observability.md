# 可観測性（AI の動き・費用・速さの記録と集計）

OshiReady は、利用者の画面には「AI が調べたこと」（使った道具と成否）だけを出し、
**トークン数・AI の呼び出し回数と時間・失敗の理由は Cloud Logging に構造化ログとして記録**する。
追加のデータベースは使わず、Cloud Logging の **Log Analytics（SQL）** で集計し、グラフを審査資料（README）に載せる。

> ログには許可リストの項目（数値・状態の名前など）だけを出し、予定の中身・画像・利用者の入力文は出さない（`src/lib/logger.ts`）。

## 1. 何を記録しているか

| ログ（`jsonPayload.message`） | いつ | 主な項目 |
|---|---|---|
| `agent.completed` | プランができたとき | `mode`（gemini / rule-based）、`model`、`steps`（記録の行数）、`itemCount`、`validationErrors`（差し戻しの回数）、`promptTokens`・`outputTokens`・`totalTokens`、`modelCalls`（AI の呼び出し回数）、`modelLatencyMs`（AI の待ち時間の合計） |
| `agent.model.turn` | AI と 1 往復するたび | `step`、`latencyMs`、`itemCount`（呼んだ道具の数）、`model` |
| `agent.tool` | 道具を 1 つ実行するたび | `tool`、`toolOk`、`latencyMs` |
| `agent.gemini.failed` | AI の呼び出しに失敗したとき | `httpStatus`、`apiStatus`・`apiReason`、`mode`（give_up / timeout / fallback）、`steps`、`latencyMs` |
| `agent.gemini.compat` / `compat_ok` | 互換モードで作り直したとき | `mode`（compat-1 / compat-2） |
| `ekispert.listTools` | 駅すぱあとから道具の一覧を取れたとき | `itemCount`（AI に渡した数）、`candidates`（駅すぱあとが公開している数）、`tools`（AI に渡した道具の名前）、`hiddenTools`（安全のため渡さなかった道具の名前） |
| `ekispert.listTools.failed` | 駅すぱあとにつながらなかったとき | `errorCode`、`httpStatus` |
| `ekispert.callTool` / `callTool.failed` | 駅すぱあとの道具を 1 つ実行するたび | `tool`、`toolOk`、`latencyMs`、`errorCode` |
| `client.error` | 利用者の画面でエラー画面が出たとき | `mode`（global＝アプリ全体 / page＝画面）、`errorCode`（エラーの種類）、`clientMessage`（短い説明。URL は除く）、`page`（画面のパス）、`digest` |

## 2. すぐに見る（ログ エクスプローラ）

コンソール →「ログ エクスプローラ」で次を検索する（サービス名は自分の環境に合わせる）。

```
resource.labels.service_name="google-hackai"
jsonPayload.message="agent.completed"
```

## 3. 集計する（Log Analytics）

### 準備（最初の 1 回・画面操作）

1. コンソール →「ログ」→「**ログ ストレージ**」
2. `_Default` バケットの「︙」→「**アップグレード**」（Log Analytics を使えるようにする）→ 確認して実行
   - 反映に数分かかる。アップグレード前のログは集計できないことがある
3. 「ログ」→「**Log Analytics**」を開き、下の SQL を貼って「クエリを実行」

> 料金：ログの取り込みは毎月 50 GiB まで無料（この アプリの量なら収まる見込み）。Log Analytics の利用料金は、実行前に [公式の料金ページ](https://cloud.google.com/products/observability/pricing) で確認すること。

以下の SQL の `PROJECT_ID` は自分のプロジェクト ID（例: `gen-lang-client-0883933612`）に置き換える。

### 日ごとのプラン作成数・トークン数・AI の待ち時間

```sql
SELECT
  DATE(timestamp, "Asia/Tokyo") AS day,
  COUNT(*) AS plans,
  ROUND(AVG(SAFE_CAST(JSON_VALUE(json_payload.totalTokens) AS INT64))) AS avg_tokens,
  ROUND(AVG(SAFE_CAST(JSON_VALUE(json_payload.modelCalls) AS INT64)), 1) AS avg_model_calls,
  ROUND(APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(json_payload.modelLatencyMs) AS INT64), 100)[OFFSET(50)] / 1000, 1) AS p50_seconds,
  ROUND(APPROX_QUANTILES(SAFE_CAST(JSON_VALUE(json_payload.modelLatencyMs) AS INT64), 100)[OFFSET(95)] / 1000, 1) AS p95_seconds,
  ROUND(AVG(SAFE_CAST(JSON_VALUE(json_payload.validationErrors) AS INT64)), 2) AS avg_self_corrections
FROM `PROJECT_ID.global._Default._AllLogs`
WHERE JSON_VALUE(json_payload.message) = "agent.completed"
  AND JSON_VALUE(resource.labels.service_name) = "google-hackai"
GROUP BY day
ORDER BY day DESC
```

### 成功率（できたプラン ÷ 試したプラン）と失敗の内訳

```sql
SELECT
  DATE(timestamp, "Asia/Tokyo") AS day,
  COUNTIF(JSON_VALUE(json_payload.message) = "agent.completed") AS completed,
  COUNTIF(JSON_VALUE(json_payload.message) = "agent.gemini.failed" AND JSON_VALUE(json_payload.mode) = "timeout") AS timeouts,
  COUNTIF(JSON_VALUE(json_payload.message) = "agent.gemini.failed" AND JSON_VALUE(json_payload.mode) = "give_up") AS rejected,
  COUNTIF(JSON_VALUE(json_payload.message) = "agent.gemini.compat_ok") AS recovered_by_compat
FROM `PROJECT_ID.global._Default._AllLogs`
WHERE JSON_VALUE(resource.labels.service_name) = "google-hackai"
  AND JSON_VALUE(json_payload.message) IN ("agent.completed", "agent.gemini.failed", "agent.gemini.compat_ok")
GROUP BY day
ORDER BY day DESC
```

### AI がよく使う道具と、その成功率・時間

```sql
SELECT
  JSON_VALUE(json_payload.tool) AS tool,
  COUNT(*) AS calls,
  ROUND(100 * COUNTIF(JSON_VALUE(json_payload.toolOk) = "true") / COUNT(*), 1) AS ok_percent,
  ROUND(AVG(SAFE_CAST(JSON_VALUE(json_payload.latencyMs) AS INT64))) AS avg_ms
FROM `PROJECT_ID.global._Default._AllLogs`
WHERE JSON_VALUE(json_payload.message) = "agent.tool"
  AND JSON_VALUE(resource.labels.service_name) = "google-hackai"
GROUP BY tool
ORDER BY calls DESC
```

### 費用の目安（1 プランあたり）

トークンの単価は、使っているモデルの [公式の料金ページ](https://cloud.google.com/vertex-ai/generative-ai/pricing) で確かめ、`IN_PRICE`・`OUT_PRICE`（100 万トークンあたりの米ドル）に入れる。

```sql
SELECT
  COUNT(*) AS plans,
  ROUND(AVG(SAFE_CAST(JSON_VALUE(json_payload.promptTokens) AS INT64)) * IN_PRICE / 1e6
      + AVG(SAFE_CAST(JSON_VALUE(json_payload.outputTokens) AS INT64)) * OUT_PRICE / 1e6, 4) AS usd_per_plan
FROM `PROJECT_ID.global._Default._AllLogs`
WHERE JSON_VALUE(json_payload.message) = "agent.completed"
  AND JSON_VALUE(resource.labels.service_name) = "google-hackai"
```

## 4. グラフにして README に載せる

1. Log Analytics でクエリを実行し、結果の「**グラフ**」タブで折れ線や棒グラフにする
2. 「**グラフを保存**」（またはダッシュボードに追加）で、`OshiReady` というダッシュボードにまとめる
3. ダッシュボードのスクリーンショットを撮り、`docs/observability-dashboard.png` として追加する（README から表示される）

## 5. 実際の Gemini での評価（`npm run eval`）

シナリオ 6 種と攻撃文 12 種を実際の Gemini で実行し、完成率・自己修正率・インジェクション耐性・トークン（費用）を `docs/eval/latest.md` に書き出す。
**Gemini の呼び出し料金がかかる**ため、実行する人が判断する（回数は `EVAL_REPEATS` で減らせる）。

Cloud Shell で（ブラウザだけで実行できる）:

```bash
cd ~/Google-hackai && git pull && npm ci
GOOGLE_GENAI_USE_VERTEXAI=true \
GOOGLE_CLOUD_PROJECT=PROJECT_ID \
GOOGLE_CLOUD_LOCATION=global \
GEMINI_MODEL=gemini-3.5-flash \
GEMINI_TOOL_MODE=AUTO \
EVAL_REPEATS=1 \
npm run eval
cat docs/eval/latest.md
```

- Cloud Shell では、ログインしている自分のアカウントの権限で Gemini を呼ぶ
- 出力された `docs/eval/latest.md` は、PR で追加する（中身を開発者に渡してもよい）

参考（公式）：[Sample SQL queries（Log Analytics）](https://docs.cloud.google.com/logging/docs/analyze/examples)、[Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets)、[Google Cloud Observability の料金](https://cloud.google.com/products/observability/pricing)
