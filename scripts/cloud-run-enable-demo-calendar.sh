#!/usr/bin/env bash
# Cloud Run の OshiReady に「デモのカレンダーで試す」を用意する（ログイン・同意画面なしでデモできる）。
# 事前に、デモ専用の Google アカウントを作り、架空の予定を入れておくこと（docs/demo-calendar.md）。
#
#   export OSHIREADY_PROJECT_ID='your-project-id'
#   bash scripts/cloud-run-enable-demo-calendar.sh
set -euo pipefail

: "${OSHIREADY_PROJECT_ID:?Set OSHIREADY_PROJECT_ID}"
REGION="${OSHIREADY_REGION:-asia-northeast1}"
SERVICE="oshiready"
P=(--project "$OSHIREADY_PROJECT_ID")

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(status.url)')"
[[ -n "$URL" ]] || { echo "Cloud Run サービスが見つかりません。先に scripts/cloud-run-bootstrap.sh を実行してください。" >&2; exit 1; }
SA="$(gcloud run services describe "$SERVICE" --region "$REGION" "${P[@]}" --format='value(spec.template.spec.serviceAccountName)')"
[[ -n "$SA" ]] || { echo "実行サービスアカウントが見つかりません。" >&2; exit 1; }

gcloud services enable calendar-json.googleapis.com "${P[@]}"

cat <<MSG

デモ用アカウントで Google カレンダー（パソコン）を開き、次のように共有してください:
  設定（歯車）→ 左の「マイカレンダーの設定」でデモのカレンダーを選ぶ
  →「特定のユーザーまたはグループと共有する」→「ユーザーやグループを追加」
  → 次のアドレスを入力し、権限を「予定の表示（すべての予定の詳細）」にして送信

    ${SA}

（このアドレスはアプリ自身です。読むだけで、予定の変更はできません）
MSG
read -rp '共有できたら Enter を押してください… ' _

read -rp 'デモのカレンダー ID（ふつうはデモ用アカウントのメールアドレス）: ' CAL_ID
[[ "$CAL_ID" == *@* && "$CAL_ID" != *[[:space:],]* ]] || { echo "カレンダー ID の形式が違います。" >&2; exit 2; }

gcloud run services update "$SERVICE" --region "$REGION" "${P[@]}" \
  --update-env-vars="DEMO_CALENDAR_ID=${CAL_ID}"

echo
if curl -fsS "${URL}/api/session" | grep -q '"id":"sample"'; then
  echo "設定しました。${URL} を開き「デモのカレンダーで試す」を押してください。"
  echo "「読み込めませんでした」と出る場合は、共有したアドレスと権限を確認してください（反映まで数分かかることがあります）。"
else
  echo "ボタンがまだ有効になっていません。少し待ってから ${URL}/api/session を確認してください。"
fi
