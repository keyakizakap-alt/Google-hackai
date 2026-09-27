# OshiReady: Cloud Run 初回公開

この手順は Google Cloud Shell で実行する。プロジェクトと課金アカウントのリンクは料金が発生し得る操作。セットアップスクリプトは Cloud Run と Artifact Registry、Secret Manager を作成し、公開 URL に 1 インスタンスまでのアクセスを許可する。予算アラートも Google Cloud コンソールで設定する（予算アラートは自動停止ではない）。

## 1. Google Cloud アカウント側

1. Google Cloud コンソールで Cloud Billing アカウントを作成・確認し、アカウント ID を控える。Cloud Shell の `gcloud billing accounts list` でも確認できる。
2. Cloud Shell を開き、公開 PR の作業ブランチを取得する。

```bash
git clone --branch claude/oshiready-ai-schedule-j80qa7 https://github.com/keyakizakap-alt/Google-hackai.git
cd Google-hackai
export OSHIREADY_PROJECT_ID='oshiready-unique-id'  # 全世界で一意な英小文字・数字・ハイフン
export OSHIREADY_BILLING_ACCOUNT='XXXXXX-XXXXXX-XXXXXX'
bash scripts/cloud-run-bootstrap.sh
```

スクリプトは `gcloud projects create`、Billing 紐付け、API 有効化、実行サービスアカウントの権限、署名用 Secret Manager、Dockerfile を使う Cloud Run ソースデプロイ、`/api/health` の確認を行う。**スクリプト自体はCloud Shell上で未実行**。初回ビルドや権限反映に時間がかかる場合は、出たエラーを確認して再実行する。プロジェクト ID やアカウント ID はリポジトリにコミットしない。

## 2. 実 Gemini の確認

- 手動で未来の公演、出発駅、希望する美容メニューを登録してプランを生成する。
- 画面の生成方法が「Gemini」であり、ツールログと提案が表示されることを確認する。
- AI 接続エラーの場合は 503 として表示される。Cloud Run ログで `agent.gemini.failed` のエラー種別を確認する。モデルの提供リージョンと利用権限を検証する。
- 予約サイトへの案内は外部サイトでの手続きであり、アプリ自身は予約や決済をしない。

## 3. Google カレンダー OAuth（公開審査に利用する場合）

Google Auth Platform の同意画面と OAuth クライアント（ウェブアプリケーション）を作成し、承認済みリダイレクト URI に `<Cloud Run URL>/api/auth/google/callback` を登録する。必要なカレンダー読み取りスコープ、公開対象、テストユーザーと審査アクセスを確認する。クライアントシークレットは Secret Manager に保存し、実行サービスアカウントだけに Secret Accessor を付与する。

```bash
# CLIENT_SECRET をシェル履歴・リポジトリ・画面出力に残さず入力する。
read -rsp 'Google OAuth client secret: ' OSHIREADY_CLIENT_SECRET; echo
printf '%s' "$OSHIREADY_CLIENT_SECRET" | gcloud secrets create oshiready-google-client-secret --data-file=-
unset OSHIREADY_CLIENT_SECRET
gcloud secrets add-iam-policy-binding oshiready-google-client-secret \
  --member="serviceAccount:oshiready-runtime@${OSHIREADY_PROJECT_ID}.iam.gserviceaccount.com" \
  --role='roles/secretmanager.secretAccessor'
gcloud run services update oshiready --region=asia-northeast1 \
  --update-env-vars="GOOGLE_CLIENT_ID=<client-id>" \
  --update-secrets="GOOGLE_CLIENT_SECRET=oshiready-google-client-secret:latest"
```

Google連携はログイン必須にしない。審査員は手動登録から実Geminiプランを操作できるようにして、本人のカレンダー連携は別導線で検証する。

## 4. 提出前のゲート

- Cloud Run の公開URLで、登録 → 実Gemini生成 → 修正 → 承認 → 予約サイト案内 → 予約メモ → 更新後の復元を確認。
- Google カレンダーの実アカウントで、予定取得・連携解除を確認。駅すぱあと MCP は実キーを設定した場合にのみ実結果を主張する。
- PC とスマートフォンでボタン、エラー、待機表示を確認。
- コードをデフォルトブランチへ反映し、提出物のURL、アーキテクチャ図、約3分の動画を揃える。

参考: [プロジェクト作成](https://docs.cloud.google.com/sdk/gcloud/reference/projects/create)、[Billing紐付け](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/link)、[Cloud Run ソースデプロイ](https://docs.cloud.google.com/run/docs/deploying-source-code)、[Secret Manager連携](https://docs.cloud.google.com/run/docs/configuring/services/secrets)。
