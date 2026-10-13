# 提出物一覧（第5回 Agentic AI Hackathon with Google Cloud）

締め切り: **2026 年 10 月 15 日（木）23:59**。参加登録とプロジェクトの提出の両方を済ませる。
提出はハッカソンのダッシュボード（https://zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol5/dashboard ）で行う。

> 要件は参加者向けスキル（`.claude/skills/gc-hackathon-vol5/`、取得元 2026-08-25 版）に基づく。最新は公式ページで確認する。

## ダッシュボードに登録するもの

> 2026-10-13 更新：Google 検索で実在の店・宿・便を探す機能、移動手段の飛行機、ライブごとのプラン一覧、エラー画面の修正を、説明文・図・動作確認の方法・台本・Zenn 記事に反映済み。**公開中の Cloud Run に反映するには再デプロイが必要**（反映前に動画を撮ると、画面と説明文が合わなくなる）。

| # | 提出物 | 必須 | 状態 | 用意するもの・やること |
|---|---|---|---|---|
| 1 | GitHub リポジトリの連携 | 必須 | 要操作 | ダッシュボードから GitHub App をインストールし、`keyakizakap-alt/Google-hackai` を連携する（非公開のままでよい） |
| 2 | デプロイした URL | 必須 | 要操作（課金あり） | Cloud Run の URL（`https://oshiready-…run.app`）。手順は [提出チェックリスト](../submission-checklist.md) の 1〜3。Vercel のプレビュー URL は使わない |
| 3 | プロジェクトの説明文 | 必須 | **下書きあり** | [project-description.md](project-description.md) をそのまま貼れる形にしてある |
| 4 | システムアーキテクチャ図 | 必須 | **用意済み** | [`docs/architecture.png`](../architecture.png)（3840×2160） |
| 5 | デモ動画（約 3 分・YouTube） | 必須 | **台本あり**・撮影は要操作 | [demo-video-script.md](demo-video-script.md) の台本で画面を録画し、YouTube に公開（「限定公開」可かは公式で確認）して URL を登録する |
| 6 | 動作確認の方法 | 審査員が試すために必要 | **下書きあり** | [how-to-try.md](how-to-try.md)。審査員はログインなしで「デモのカレンダーで試す」から試せる |
| 7 | Zenn 記事 | 任意 | **下書きあり** | [zenn-article.md](zenn-article.md)。投稿する場合はカテゴリ「Idea」で公開し、URL を登録する |
| 8 | Flutter / Firebase の利用の申告 | 任意 | 該当なし | どちらも使っていない |

## 規約上の条件（確認済み）

| 条件 | 状態 | 根拠 |
|---|---|---|
| Google Cloud の実行プロダクトを使う | Cloud Run | `Dockerfile`・`cloudbuild.yaml`・`scripts/cloud-run-bootstrap.sh` |
| Google Cloud の AI 技術を使う | Gemini（Vertex AI 経由も可。Function Calling・構造化出力・Google 検索によるグラウンディング） | `@google/genai`、`src/lib/agent/orchestrator.ts`、`src/lib/services/webSearch.ts` |
| 日本語で記載する | 対応済み | README・ドキュメント・画面の文言 |
| OSS のライセンス情報を明記する | 対応済み | README の「ライセンス」、`LICENSE` |
| どこを開発し、どこがモックかを説明する | 対応済み | README の「開発した範囲とモックの箇所」 |
| 期間中に開発したものを出す | 対応済み | 最初のコミットは 2026-09-17 |

## 提出の順番

1. Cloud Run に公開し、デモのカレンダーを設定する（[提出チェックリスト](../submission-checklist.md) の 1〜3）
2. 公開した URL で、[how-to-try.md](how-to-try.md) の手順を通しで確認する（シークレットウィンドウ）
3. 台本どおりにデモ動画を録画し、YouTube に公開する
4. ダッシュボードで説明文・図・動画 URL・デプロイ URL・動作確認の方法を入力し、**提出タブから提出する**
5. 提出したら `bash scripts/cloud-run-demo-mode.sh judging` で審査期間用に切り替える（[審査期間の運用](../judging-period.md)）

## 提出後に守ること（12 月 1 日まで）

- 審査は**連携したリポジトリのデフォルトブランチ（`main`）**が対象。提出後は `main` にマージしない（開発を続けるなら別ブランチで）
- リポジトリの連携解除・削除をしない
- デプロイした URL を動く状態に保つ
- 提出後に動画・リポジトリの内容を直さない
