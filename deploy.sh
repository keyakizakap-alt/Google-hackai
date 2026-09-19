#!/usr/bin/env bash
# Cloud Run へデプロイする。Cloud Shell ならそのまま実行できる。
#
#   ./deploy.sh                  … デモモード（Gemini なし）で公開
#   GEMINI_API_KEY=xxx ./deploy.sh … キーを Secret Manager に登録して公開
#
# --max-instances を付けているのは、公開URLを第三者に叩かれたときの費用の上限を
# 作るため。外さないこと。

set -euo pipefail

SERVICE="${SERVICE:-reverse-concierge}"
REGION="${REGION:-asia-northeast1}"
SECRET="${SECRET:-gemini-api-key}"
MODEL="${GEMINI_MODEL:-gemini-3.5-flash}"

PROJECT="$(gcloud config get-value project 2>/dev/null)"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "エラー: プロジェクトが未設定です。次を実行してください:" >&2
  echo "  gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

echo "プロジェクト : $PROJECT"
echo "サービス名   : $SERVICE ($REGION)"
echo

echo "==> 必要な API を有効化します（数分かかることがあります）"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --project "$PROJECT"

ENV_VARS="GEMINI_MODEL=${MODEL}"
SECRET_ARGS=()

if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  echo "==> API キーを Secret Manager に登録します"
  gcloud services enable secretmanager.googleapis.com --project "$PROJECT"

  if gcloud secrets describe "$SECRET" --project "$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$GEMINI_API_KEY" | \
      gcloud secrets versions add "$SECRET" --data-file=- --project "$PROJECT"
  else
    printf '%s' "$GEMINI_API_KEY" | \
      gcloud secrets create "$SECRET" --data-file=- --project "$PROJECT"
  fi

  # Cloud Run のランタイムサービスアカウントにシークレットの読み取りを許可する
  PROJECT_NUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT" >/dev/null

  SECRET_ARGS=(--set-secrets "GEMINI_API_KEY=${SECRET}:latest")
else
  echo "==> GEMINI_API_KEY が未設定のため、デモモード（ルールベース）で公開します"
fi

echo
echo "==> Cloud Run へデプロイします"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --max-instances 3 \
  --set-env-vars "$ENV_VARS" \
  "${SECRET_ARGS[@]}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --project "$PROJECT" --format='value(status.url)')"

echo
echo "完了しました: $URL"
echo "動作確認     : curl -s ${URL}/healthz"
