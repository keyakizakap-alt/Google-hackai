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

## 4. 提出前のゲート

- Cloud Run の公開URLで、登録 → 実Gemini生成 → 修正 → 承認 → 予約サイト案内 → 予約メモ → 更新後の復元を確認。
- Google カレンダーの実アカウントで、予定取得・連携解除を確認。駅すぱあと MCP は実キーを設定した場合にのみ実結果を主張する。
- PC とスマートフォンでボタン、エラー、待機表示を確認。
- コードをデフォルトブランチへ反映し、提出物のURL、アーキテクチャ図、約3分の動画を揃える。

参考: [プロジェクト作成](https://docs.cloud.google.com/sdk/gcloud/reference/projects/create)、[Billing紐付け](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/link)、[Cloud Run ソースデプロイ](https://docs.cloud.google.com/run/docs/deploying-source-code)、[Secret Manager連携](https://docs.cloud.google.com/run/docs/configuring/services/secrets)。
