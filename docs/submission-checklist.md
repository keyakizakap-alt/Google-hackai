# 提出チェックリスト（第5回 Agentic AI Hackathon with Google Cloud）

締め切り前にこの順で進める。**課金・公開を伴う手順は、実行する人が判断する**（コードからは実行しない）。

## 1. Cloud Run に公開する（課金あり）

手順の詳細は [cloud-run-launch.md](cloud-run-launch.md)。Cloud Shell で `main` を取得して実行する。

```bash
git clone --branch main https://github.com/keyakizakap-alt/Google-hackai.git && cd Google-hackai
export OSHIREADY_PROJECT_ID='<一意なプロジェクトID>'
export OSHIREADY_BILLING_ACCOUNT='<請求先アカウントID>'
export OSHIREADY_GEMINI_MODEL='<公式ドキュメントで確認したモデル名>'   # 未指定なら gemini-3.5-flash
bash scripts/cloud-run-bootstrap.sh
```

- [ ] `/api/health` が応答する（スクリプトの最後に表示される）
- [ ] モデル名は ai.google.dev / cloud.google.com の公式ドキュメントで、`global` で使えることを確認した
- [ ] 予算アラートをコンソールで設定した（自動停止ではない）

## 2. 審査員がログインなしで試せるようにする

手順は [demo-calendar.md](demo-calendar.md)。デモ専用の Google アカウントに架空の予定を入れ、アプリのサービスアカウントに共有する。

```bash
export OSHIREADY_PROJECT_ID='<プロジェクトID>'
bash scripts/cloud-run-enable-demo-calendar.sh
```

- [ ] ホームに「デモのカレンダーで試す」が出て、押すとライブが登録される
- [ ] シークレットウィンドウで、デモ → プラン作成 → 修正指示 → 承認 → デモ予約 → 予約の管理 → キャンセル、まで通る
- [ ] 「AI が調べたこと」に、ツールの呼び出しと（起きれば）差し戻し → 再提出が出る
- [ ] 設定の「AI ができること・できないこと」と、見張りのスイッチが表示される

## 3. 審査期間の AI 呼び出し上限を上げる（課金に影響）

スクリプトの既定は 1 日 25 回（インスタンスごと）。プラン作成・修正・見直し案・ライブの取り込みで 1 回ずつ減る。通しの確認が済んだら、審査に足りる回数へ上げる。

```bash
gcloud run services update oshiready --region asia-northeast1 --project "$OSHIREADY_PROJECT_ID" \
  --update-env-vars=AGENT_DAILY_LIMIT=<回数>
```

- [ ] 上限を決めて設定した（費用の見積もりは手順 4 の結果で確認できる）

## 4. エージェントを実測する（課金あり・任意だが推奨）

```bash
node -v                      # 22 系を推奨（Dockerfile と CI に合わせる）
npm ci
gcloud auth application-default login
GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT="$OSHIREADY_PROJECT_ID" GOOGLE_CLOUD_LOCATION=global \
GEMINI_MODEL='<モデル名>' SESSION_SECRET="$(openssl rand -base64 48)" \
EVAL_REPEATS=1 npm run eval
```

- [ ] 最初は `EVAL_REPEATS=1` で小さく回した（シナリオ 6 回 + 攻撃文 12 回）
- [ ] 料金を換算する場合は、公式の価格表で確認した単価を `EVAL_PRICE_INPUT_PER_MTOK` / `EVAL_PRICE_OUTPUT_PER_MTOK` に渡した
- [ ] `docs/eval/latest.md` をコミットし、主要な数字を提出の説明文に書いた

## 5. 提出物

- [ ] GitHub リポジトリの URL
- [ ] デプロイ URL は **Cloud Run の URL**（`https://oshiready-…run.app`）。Vercel のプレビュー URL は使わない
- [ ] 動作確認の方法: 「デモのカレンダーで試す」から始める手順（Google ログイン・メール受信は不要）と、デモ予約であること
- [ ] システムアーキテクチャ図: `docs/architecture.png`
- [ ] デモ動画（約 3 分）の URL
- [ ] 説明文で、審査の 3 軸（課題と有効性／自律性と管理・可観測性・セキュリティ／実装品質・拡張性・費用対効果）に答えている
