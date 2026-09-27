#!/usr/bin/env bash
# OshiReady on Cloud Run の状態をまとめて点検する（読み取りのみ。何も変更しない）。
# 秘密の値は表示しない（環境変数は名前だけ、ログはイベント名とエラー種別だけを出す）。
#
#   export OSHIREADY_PROJECT_ID='your-project-id'
#   bash scripts/cloud-run-doctor.sh
set -uo pipefail

: "${OSHIREADY_PROJECT_ID:?Set OSHIREADY_PROJECT_ID}"
REGION="${OSHIREADY_REGION:-asia-northeast1}"
SERVICE="oshiready"
P=(--project "$OSHIREADY_PROJECT_ID")
ok() { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
ng() { printf '  \033[31mNG\033[0m  %s\n' "$*"; }
hd() { printf '\n== %s\n' "$*"; }

hd "1. 有効な API"
enabled="$(gcloud services list --enabled "${P[@]}" --format='value(config.name)' 2>/dev/null)"
for api in run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com calendar-json.googleapis.com; do
  grep -qx "$api" <<<"$enabled" && ok "$api" || ng "$api が無効（gcloud services enable $api）"
done

hd "2. 直近のビルド（Cloud Build）"
gcloud builds list "${P[@]}" --region="$REGION" --limit=3 --format='table(id.slice(0:8),status,createTime.date("%m-%d %H:%M"))' 2>/dev/null \
  || gcloud builds list "${P[@]}" --limit=3 --format='table(id.slice(0:8),status,createTime.date("%m-%d %H:%M"))'
echo "  失敗(FAILURE)があれば: gcloud builds log <ID> --region=$REGION ${P[*]} | grep -n -i -E 'error|failed|not found' | head"

hd "3. Cloud Run サービス"
if ! gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(metadata.name)' >/dev/null 2>&1; then
  ng "サービス $SERVICE が見つからない（デプロイが一度も成功していない）→ scripts/cloud-run-bootstrap.sh を再実行"
  exit 1
fi
gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" \
  --format='yaml(status.url,status.urls,status.latestReadyRevisionName,status.latestCreatedRevisionName,status.conditions)' | sed 's/^/  /'
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(status.url)')"
ready="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(status.latestReadyRevisionName)')"
created="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(status.latestCreatedRevisionName)')"
[[ "$ready" == "$created" ]] && ok "最新リビジョンが稼働中" || ng "最新リビジョン $created が起動できていない（下の 6 のログを確認）"

hd "4. 設定（秘密の値は表示しない）"
gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format=json | python3 -c '
import json, sys
env = {e["name"]: e for e in json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0].get("env", [])}
show = {"APP_BASE_URL", "GEMINI_MODEL", "GOOGLE_CLOUD_LOCATION", "GOOGLE_GENAI_USE_VERTEXAI"}
for n in ["SESSION_SECRET", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION",
          "GEMINI_MODEL", "APP_BASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]:
    e = env.get(n)
    if not e:
        print(f"  \033[31mNG\033[0m  {n} が未設定"); continue
    how = "Secret Manager" if "valueFrom" in e else ("= " + e.get("value", "") if n in show else "設定あり")
    print(f"  \033[32mOK\033[0m  {n}（{how}）")
m = env.get("GEMINI_MODEL", {}).get("value", "")
if m.startswith("gemini-2.5"):
    print("  \033[31mNG\033[0m  gemini-2.5 系は 2026年10月に提供終了予定 → gemini-3.5-flash へ切り替えを推奨")
'

hd "5. 実行サービスアカウントの権限"
sa="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(spec.template.spec.serviceAccountName)')"
echo "  $sa"
roles="$(gcloud projects get-iam-policy "$OSHIREADY_PROJECT_ID" --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:$sa" --format='value(bindings.role)')"
grep -qx 'roles/aiplatform.user' <<<"$roles" && ok "roles/aiplatform.user（Gemini 呼び出し）" || ng "roles/aiplatform.user が無い → Gemini が 403 になる"

hd "6. 動作確認"
curl -fsS "$URL/api/health" >/dev/null && ok "/api/health" || ng "/api/health に応答しない"
curl -fsS "$URL/api/session" | sed 's/^/  /'; echo

hd "7. 直近 1 時間の警告・エラー（イベント名とエラー種別のみ）"
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND severity>=WARNING" \
  "${P[@]}" --freshness=1h --limit=30 \
  --format='table(timestamp.date("%H:%M:%S"),severity,jsonPayload.message,jsonPayload.errorCode,jsonPayload.httpStatus,textPayload.slice(0:120))'
echo
echo "表示された NG と 7 のイベント名（例: agent.gemini.failed / oauth.token.failed）を伝えてください。"
