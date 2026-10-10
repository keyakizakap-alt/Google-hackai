#!/usr/bin/env bash
# デモ・審査の期間だけ、OshiReady の Cloud Run を「待たせない・止まらない」設定に切り替える。
#
#   export OSHIREADY_PROJECT_ID='your-project-id'
#   bash scripts/cloud-run-demo-mode.sh lite    # 費用を抑えたデモ用（使っていないときは止まる。おすすめ）
#   bash scripts/cloud-run-demo-mode.sh warmup  # デモ直前に 1 回呼んで起こしておく（費用はほぼかからない）
#   bash scripts/cloud-run-demo-mode.sh judging # 審査期間用（on と同じ設定＋終了日の目印。既定 2026-12-02 まで）
#   bash scripts/cloud-run-demo-mode.sh on      # デモ用に切り替える（常に 1 台起動 → 費用が継続して発生）
#   bash scripts/cloud-run-demo-mode.sh off     # 試験用（費用を抑える設定）に戻す
#   bash scripts/cloud-run-demo-mode.sh status  # いまの設定を表示する
#
# 値は環境変数で変えられる: OSHIREADY_DEMO_MAX_INSTANCES（既定 3）、OSHIREADY_DEMO_CONCURRENCY（既定 20）、
# OSHIREADY_DEMO_DAILY_LIMIT（既定 300。AI の 1 日の利用回数・1 台あたり）
set -euo pipefail

: "${OSHIREADY_PROJECT_ID:?Set OSHIREADY_PROJECT_ID}"
REGION="${OSHIREADY_REGION:-asia-northeast1}"
SERVICE="oshiready"
P=(--project "$OSHIREADY_PROJECT_ID" --region "$REGION")

status() {
  gcloud run services describe "$SERVICE" "${P[@]}" --format=json | python3 -c '
import json, sys
s = json.load(sys.stdin)
a = s["spec"]["template"]["metadata"].get("annotations", {})
spec = s["spec"]["template"]["spec"]
env = {e["name"]: e.get("value") for e in spec["containers"][0].get("env", [])}
print("  常に起動しておく台数 :", a.get("autoscaling.knative.dev/minScale", "0"))
print("  最大の台数           :", a.get("autoscaling.knative.dev/maxScale", "-"))
print("  1 台が同時に受ける数 :", spec.get("containerConcurrency", "-"))
print("  AI の 1 日の利用回数 :", env.get("AGENT_DAILY_LIMIT", "500（既定）"))
print("  AI のモデル          :", env.get("GEMINI_MODEL", "-"))
until = s["metadata"].get("labels", {}).get("judging-until")
if until:
    import datetime
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
    print("  審査期間の設定       :", until, "まで", "（期間が終わっています。lite に戻してください）" if today > until else "")
'
  echo "  URL: $(URL_OF)"
}

URL_OF() { gcloud run services describe "$SERVICE" "${P[@]}" --format='value(status.url)'; }

case "${1:-status}" in
  lite)
    cat <<MSG
費用を抑えたデモ用の設定に切り替えます:
  - 使っていないときは 0 台（止まっていて費用はかからない）
  - 最大 2 台・1 台あたり同時 20 件（審査員が同時に触っても待たされにくい）
  - AI の 1 日の利用回数 100 回（1 台あたり。使いすぎによる費用の増加を防ぐ）
  ※ 止まっている状態から最初に開くと数秒かかります。デモ直前に warmup を実行してください。
MSG
    gcloud run services update "$SERVICE" "${P[@]}" \
      --min-instances=0 --max-instances=2 --concurrency=20 \
      --update-env-vars="AGENT_DAILY_LIMIT=${OSHIREADY_DEMO_DAILY_LIMIT:-100}" \
      --remove-labels=judging-until
    ;;
  warmup)
    url="$(URL_OF)"
    for i in 1 2 3; do curl -fsS -o /dev/null -w "起こしています… %{http_code}（%{time_total} 秒）\n" "$url/api/health" || true; sleep 2; done
    echo "準備できました。15 分ほど操作がないと再び止まるので、デモの直前に実行してください。"
    exit 0
    ;;
  judging)
    # 審査期間（12/1 まで。余裕をみて 12/2 いっぱい）は、いつ開かれてもすぐ動くよう常に 1 台起動しておく
    UNTIL="${OSHIREADY_JUDGING_UNTIL:-2026-12-02}"
    LIMIT="${OSHIREADY_DEMO_DAILY_LIMIT:-300}"
    cat <<MSG
審査期間用の設定に切り替えます（${UNTIL} まで）:
  - 常に 1 台起動（審査員がいつ開いても待たせない。そのぶん費用が継続して発生します）
  - 最大 3 台・1 台あたり同時 20 件
  - AI の 1 日の利用回数 ${LIMIT} 回（1 台あたり）
  - サービスに「judging-until=${UNTIL}」の目印を付けます（status で確認できます）
MSG
    read -rp '続けますか？ [y/N] ' ok
    [[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "中止しました"; exit 0; }
    gcloud run services update "$SERVICE" "${P[@]}" \
      --min-instances=1 --max-instances=3 --concurrency=20 \
      --update-env-vars="AGENT_DAILY_LIMIT=${LIMIT}" \
      --update-labels="judging-until=${UNTIL}"
    echo; echo "切り替えました。審査期間が終わったら（${UNTIL} の翌日に）、次で費用を抑えた設定に戻してください:"
    echo "  bash scripts/cloud-run-demo-mode.sh lite"
    ;;
  on)
    MAX="${OSHIREADY_DEMO_MAX_INSTANCES:-3}"
    CONC="${OSHIREADY_DEMO_CONCURRENCY:-20}"
    LIMIT="${OSHIREADY_DEMO_DAILY_LIMIT:-300}"
    cat <<MSG
デモ用の設定に切り替えます:
  - 常に 1 台起動（最初に開いたときの待ち時間をなくす。そのぶん費用が継続して発生します）
  - 最大 ${MAX} 台・1 台あたり同時 ${CONC} 件
  - AI の 1 日の利用回数 ${LIMIT} 回（1 台あたり）
MSG
    read -rp '続けますか？ [y/N] ' ok
    [[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "中止しました"; exit 0; }
    gcloud run services update "$SERVICE" "${P[@]}" \
      --min-instances=1 --max-instances="$MAX" --concurrency="$CONC" \
      --update-env-vars="AGENT_DAILY_LIMIT=${LIMIT}"
    echo; echo "切り替えました。デモが終わったら、必ず次で戻してください:"
    echo "  bash scripts/cloud-run-demo-mode.sh off"
    ;;
  off)
    gcloud run services update "$SERVICE" "${P[@]}" \
      --min-instances=0 --max-instances=1 --concurrency=5 \
      --update-env-vars="AGENT_DAILY_LIMIT=${OSHIREADY_AGENT_DAILY_LIMIT:-25}" \
      --remove-labels=judging-until
    echo; echo "試験用の設定（使っていないときは止まる）に戻しました。"
    ;;
  status) ;;
  *) echo "使い方: bash scripts/cloud-run-demo-mode.sh lite|warmup|judging|on|off|status" >&2; exit 2 ;;
esac
echo; echo "いまの設定:"; status
