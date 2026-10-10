# OshiReady: Cloud Run 初回公開

この手順は Google Cloud Shell で実行する。プロジェクトと課金アカウントのリンクは料金が発生し得る操作。セットアップスクリプトは Cloud Run と Artifact Registry、Secret Manager を作成し、公開 URL に 1 インスタンスまでのアクセスを許可する。予算アラートも Google Cloud コンソールで設定する（予算アラートは自動停止ではない）。

## 1. Google Cloud アカウント側

1. Google Cloud コンソールで Cloud Billing アカウントを作成・確認し、アカウント ID を控える。Cloud Shell の `gcloud billing accounts list` でも確認できる。
2. Cloud Shell を開き、`main` ブランチを取得する（提出する版は `main`。古い作業ブランチを取得しない）。

```bash
git clone --branch main https://github.com/keyakizakap-alt/Google-hackai.git
cd Google-hackai
export OSHIREADY_PROJECT_ID='oshiready-unique-id'  # 全世界で一意な英小文字・数字・ハイフン
export OSHIREADY_BILLING_ACCOUNT='XXXXXX-XXXXXX-XXXXXX'
# 任意: モデル名と 1 日の AI 呼び出し上限（既定 gemini-3.5-flash / 25 回）
# export OSHIREADY_GEMINI_MODEL='<公式ドキュメントで確認したモデル名>'
# export OSHIREADY_AGENT_DAILY_LIMIT=25
bash scripts/cloud-run-bootstrap.sh
```

スクリプトは `gcloud projects create`、Billing 紐付け、API 有効化、実行サービスアカウントの権限、署名用 Secret Manager、Dockerfile を使う Cloud Run ソースデプロイ、`/api/health` の確認を行う。**スクリプト自体はCloud Shell上で未実行**。初回ビルドや権限反映に時間がかかる場合は、出たエラーを確認して再実行する。プロジェクト ID やアカウント ID はリポジトリにコミットしない。

## 2. 実 Gemini の確認

- 手動で未来の公演、出発駅、希望する美容メニューを登録してプランを生成する。
- 画面の生成方法が「Gemini」であり、ツールログと提案が表示されることを確認する。
- AI 接続エラーの場合は 503 として表示される。Cloud Run ログで `agent.gemini.failed` のエラー種別を確認する。モデルの提供リージョンと利用権限を検証する。
- 予約は承認して「予約する」を押した項目だけ。既定はデモ予約（`BOOKING_PROVIDERS=demo`）で、実在の店舗には届かず、決済もしない。部品が対応しない項目は予約サイトへ案内する。

## 3. Google カレンダー OAuth

`docs/google-calendar-setup.md` の手順で OAuth クライアントを作り、Cloud Shell で次を実行する（シークレットは非表示で入力され、Secret Manager にだけ保存される）。

```bash
export OSHIREADY_PROJECT_ID='your-project-id'
bash scripts/cloud-run-enable-calendar.sh
```

Google連携はログイン必須にしない。審査員は手動登録から実Geminiプランを操作できるようにして、本人のカレンダー連携は別導線で検証する。

## うまく動かないとき

```bash
export OSHIREADY_PROJECT_ID='your-project-id'
bash scripts/cloud-run-doctor.sh
```

API の有効化・直近のビルド・リビジョンの起動状況・設定（値は表示しない）・実行サービスアカウントの権限・直近のエラーログ（イベント名とエラー種別のみ）をまとめて表示する。読み取りのみで何も変更しない。
### プラン作成で「処理中にエラーが発生しました」「サーバー設定が不足しています（SESSION_SECRET）」と出る

プランの署名に使う `SESSION_SECRET` が Cloud Run に渡っていない（コンソールから作成した、`--set-secrets` なしでデプロイした等）。`/api/health` が `"sessionSecret":false` を返す。

```bash
export OSHIREADY_PROJECT_ID='your-project-id'
SA="$(gcloud run services describe oshiready --region asia-northeast1 --project "$OSHIREADY_PROJECT_ID" --format='value(spec.template.spec.serviceAccountName)')"
# まだ無ければ作る（値は画面にもシェル履歴にも出さない）
gcloud secrets describe oshiready-session-secret --project "$OSHIREADY_PROJECT_ID" >/dev/null 2>&1 || \
  openssl rand -base64 48 | gcloud secrets create oshiready-session-secret --data-file=- --replication-policy=automatic --project "$OSHIREADY_PROJECT_ID"
gcloud secrets add-iam-policy-binding oshiready-session-secret --project "$OSHIREADY_PROJECT_ID" \
  --member="serviceAccount:${SA}" --role='roles/secretmanager.secretAccessor'
gcloud run services update oshiready --region asia-northeast1 --project "$OSHIREADY_PROJECT_ID" \
  --update-secrets=SESSION_SECRET=oshiready-session-secret:latest
```

Gemini のモデルは `OSHIREADY_GEMINI_MODEL` で変えられる（既定 `gemini-3.5-flash`。`gemini-2.5` 系は 2026年10月に提供終了予定）。

## デモ・審査の期間だけの設定

```bash
bash scripts/cloud-run-demo-mode.sh on      # 常に 1 台起動・最大 3 台・同時 20 件・AI 300 回/日（費用が継続して発生）
bash scripts/cloud-run-demo-mode.sh status  # いまの設定を確認
bash scripts/cloud-run-demo-mode.sh off     # 終わったら必ず戻す
```

予算アラート（コンソールの「お支払い」→「予算とアラート」）も先に設定しておく。アラートは通知だけで、自動では止まらない。

## 4. 提出前のゲート

- Cloud Run の公開URLで、登録 → 実Gemini生成 → 修正 → 承認 → 予約サイト案内 → 予約メモ → 更新後の復元を確認。
- Google カレンダーの実アカウントで、予定取得・連携解除を確認。駅すぱあと MCP は実キーを設定した場合にのみ実結果を主張する。
- PC とスマートフォンでボタン、エラー、待機表示を確認。
- コードをデフォルトブランチへ反映し、提出物のURL、アーキテクチャ図、約3分の動画を揃える。

参考: [プロジェクト作成](https://docs.cloud.google.com/sdk/gcloud/reference/projects/create)、[Billing紐付け](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/link)、[Cloud Run ソースデプロイ](https://docs.cloud.google.com/run/docs/deploying-source-code)、[Secret Manager連携](https://docs.cloud.google.com/run/docs/configuring/services/secrets)。
