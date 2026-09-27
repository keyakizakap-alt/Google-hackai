#!/usr/bin/env bash
# Cloud Run の OshiReady で Google カレンダー連携を有効にする。
# 事前に Google Auth Platform で OAuth クライアント（ウェブ アプリケーション）を作っておくこと（docs/google-calendar-setup.md）。
# クライアント シークレットは画面に表示せずに入力し、Secret Manager にだけ保存する。
#
#   export OSHIREADY_PROJECT_ID='your-project-id'
#   bash scripts/cloud-run-enable-calendar.sh
set -euo pipefail

: "${OSHIREADY_PROJECT_ID:?Set OSHIREADY_PROJECT_ID}"
REGION="${OSHIREADY_REGION:-asia-northeast1}"
SERVICE="oshiready"
SECRET="oshiready-google-client-secret"
RUNTIME_EMAIL="oshiready-runtime@${OSHIREADY_PROJECT_ID}.iam.gserviceaccount.com"
P=(--project "$OSHIREADY_PROJECT_ID")

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(status.url)')"
[[ -n "$URL" ]] || { echo "Cloud Run サービスが見つかりません。先に scripts/cloud-run-bootstrap.sh を実行してください。" >&2; exit 1; }

echo "このアプリの公開 URL: $URL"
echo "Google Auth Platform → クライアント → 承認済みのリダイレクト URI に、次を登録してください:"
echo
echo "    ${URL}/api/auth/google/callback"
echo
read -rp '登録できたら Enter を押してください… ' _

gcloud services enable calendar-json.googleapis.com "${P[@]}"

read -rp 'OAuth クライアント ID（…apps.googleusercontent.com）: ' CLIENT_ID
[[ "$CLIENT_ID" == *.apps.googleusercontent.com ]] || { echo "クライアント ID の形式が違います。" >&2; exit 2; }
read -rsp 'OAuth クライアント シークレット（表示されません）: ' CLIENT_SECRET; echo
[[ -n "$CLIENT_SECRET" ]] || { echo "シークレットが空です。" >&2; exit 2; }

if gcloud secrets describe "$SECRET" "${P[@]}" >/dev/null 2>&1; then
  printf '%s' "$CLIENT_SECRET" | gcloud secrets versions add "$SECRET" --data-file=- "${P[@]}" >/dev/null
else
  printf '%s' "$CLIENT_SECRET" | gcloud secrets create "$SECRET" --data-file=- --replication-policy=automatic "${P[@]}" >/dev/null
fi
unset CLIENT_SECRET
gcloud secrets add-iam-policy-binding "$SECRET" "${P[@]}" \
  --member="serviceAccount:${RUNTIME_EMAIL}" --role='roles/secretmanager.secretAccessor' --quiet >/dev/null

# APP_BASE_URL は OAuth の戻り先と一致させる（別の URL で開いても、連携開始時にこの URL へ自動で移る）
gcloud run services update "$SERVICE" --region "$REGION" "${P[@]}" \
  --update-env-vars="GOOGLE_CLIENT_ID=${CLIENT_ID},APP_BASE_URL=${URL}" \
  --update-secrets="GOOGLE_CLIENT_SECRET=${SECRET}:latest"

echo
curl -fsS "${URL}/api/session" | grep -o '"googleOAuthConfigured":[a-z]*' || true
echo "↑ true なら設定完了です。${URL}/settings を開いて「Google カレンダーを連携」を押してください。"
echo "（公開ステータスが「テスト」の間は、テストユーザーに登録したアカウントだけが連携でき、7 日で再連携が必要です）"
