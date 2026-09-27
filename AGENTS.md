# AGENTS.md

AIコーディングエージェント向けの作業ガイド。人間向けの説明は `README.md` を参照。

## プロジェクトの現状

- **OshiReady**：ライブ（推し活）の日時から、美容院・ネイル・移動・宿泊の準備を逆算してプランを作る AI エージェント（第5回 Agentic AI Hackathon with Google Cloud 向け）。
- プランは必ず `pending_approval`（ユーザーの承認待ち）を経由し、ユーザーの操作なしに予約へ進めない。アプリ自身は予約・決済をしない。
- カレンダーの予定や顔画像はメモリ上で Gemini に渡すだけにし、DB・ログ（`console.log` を含む）へ出力・保存しない。
- 仕様を変えるときは、まずこのファイルの「技術スタック」と「開発コマンド」を更新する。決まっていないことは推測で決めず、推奨案と理由（前提・制約・リスク）を添えて人間に確認する。

## 技術スタック

| 項目 | 内容 |
|---|---|
| アイデア・対象ユーザー | OshiReady（ライブに行くファン向けの準備スケジュール逆算） |
| フロントエンド | Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS v4 |
| バックエンド／実行環境 | Next.js Route Handlers（`src/app/api`）。本番は Cloud Run（`Dockerfile`、standalone 出力）、プレビューは Vercel |
| AI | Gemini（`@google/genai`、Function Calling・構造化出力）。モデルは環境変数 `GEMINI_MODEL` |
| 外部連携 | Google カレンダー（OAuth・読み取り専用）、駅すぱあと MCP、YouCam（モック） |
| データストア | サーバー側は持たない（署名付きの状態をクライアントが保持）。端末側は IndexedDB / localStorage |
| リージョン | asia-northeast1（Cloud Run） |

## 開発コマンド

```bash
npm ci             # 依存のインストール
npm run dev        # ローカル起動（http://localhost:3000）
npm run lint       # ESLint
npm run typecheck  # 型チェック
npm test           # Vitest
npm run build      # 本番ビルド（standalone）
```

Cloud Run へのデプロイ手順は `docs/cloud-run-launch.md`、運用（シークレットの入れ替えなど）は `docs/operations.md` を参照。

## Gemini の利用

- SDK は **Google Gen AI SDK**（Python: `google-genai`、JavaScript/TypeScript: `@google/genai`）を使う。
  旧 SDK の `google-generativeai` や Vertex AI SDK の `vertexai.generative_models` は非推奨のため使わない。
- Gemini Developer API（APIキー）と Vertex AI（Google Cloud プロジェクト＋IAM）のどちらを使うかは、プロジェクト方針が決まるまで人間に確認する。
  同じ SDK で環境変数（`GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`）により切り替えられる形にしておく。
- **モデル名は記憶に頼らず、公式ドキュメント（ai.google.dev / cloud.google.com）で現行のものを確認する**。
  コードに直書きせず、設定値・環境変数で差し替えられるようにする。Preview のモデルや機能を使う場合はその旨をコメントか README に明記する。
- プロンプトはコードに埋め込まず、まとまった単位でファイルや定数に分けて管理する。
- 生成結果はそのまま信用しない。構造化出力（JSON スキーマ指定）を使う場合もパース失敗・不正値を想定して検証する。

## 認証情報・セキュリティ

- APIキー・サービスアカウントキー・トークンを**コミットしない**。ローカルは `.env`（gitignore 済み）、本番は Secret Manager 等を使う。
- Google Cloud への認証はローカルでは `gcloud auth application-default login`（ADC）を使い、サービスアカウントの鍵ファイルは作らない。
- **APIキーをブラウザ側のコードに置かない**。Gemini の呼び出しはバックエンド経由にする。
- IAM 権限は必要最小限にする。権限の付与・変更は人間に確認する。
- ユーザー入力をそのままプロンプトに連結する箇所は、プロンプトインジェクションを想定して扱う（システム指示と分離し、出力で危険な操作を直接実行しない）。

## コーディング規約

- コメント・UI 文言・ドキュメントは日本語。
- 既存コードの書き方（命名、ディレクトリ構成、コメントの密度）に合わせる。
- 仕様・構成を変えたら `README.md` とこのファイルの該当箇所も更新する。

## Git・PR

- `main` へ直接 push しない。作業ブランチ → PR で反映する。
- コミットには動く状態のものだけを入れる（ビルド・テストが整備された後は、それらを通してからコミットする）。

## 確認が必要な操作

次は実行前に必ず人間に確認する:

- 課金が発生する操作（Google Cloud リソースの作成、API の有効化、Gemini の大量呼び出し、有料プランの利用）
- デプロイ・外部への公開
- ファイルの削除・大規模な書き換え、データの初期化
- IAM・認証情報・シークレットの作成や変更

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
