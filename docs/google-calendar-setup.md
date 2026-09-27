# Google カレンダー連携の設定

> ログインなしでデモしたい場合は、先に `docs/demo-calendar.md`（デモのカレンダー）を参照。こちらは利用者本人のカレンダーと連携するための設定。

アプリ側の機能（読み取り専用・PKCE・暗号化 Cookie・ライブの自動取り込み）は実装済み。
Google 側で OAuth クライアントを作り、公開先（Cloud Run / Vercel）に 3 つの値を渡すと「Google カレンダーを連携」ボタンが使えるようになる。
クライアント シークレットはチャット・リポジトリ・シェル履歴に残さない。

## 1. Google Cloud コンソール（共通）

1. アプリを動かしているプロジェクトを選ぶ。
2. 「API とサービス」→「ライブラリ」→ **Google Calendar API** を有効にする。
3. 「Google Auth Platform」（旧: OAuth 同意画面）
   - アプリ名: OshiReady ／ サポートメール: 自分
   - 対象: **外部**、公開ステータス: **テスト**
   - テストユーザー: 連携を試す Google アカウントを追加（最大 100 人）
   - データアクセス: `https://www.googleapis.com/auth/calendar.events.readonly` を追加
4. 「クライアント」→「クライアントを作成」→ 種類 **ウェブ アプリケーション**
   - 承認済みのリダイレクト URI: `<公開 URL>/api/auth/google/callback`
     - Cloud Run: `scripts/cloud-run-enable-calendar.sh` が表示する URL
     - Vercel: `https://oshiready.vercel.app/api/auth/google/callback`
     - ローカル: `http://localhost:3000/api/auth/google/callback`
5. クライアント ID とクライアント シークレットを控える。

## 2-A. Cloud Run の場合（Cloud Shell で実行）

```bash
cd Google-hackai && git pull
export OSHIREADY_PROJECT_ID='your-project-id'
bash scripts/cloud-run-enable-calendar.sh
```

スクリプトがリダイレクト URI を表示し、クライアント ID とシークレット（非表示入力）を受け取って、
シークレットは Secret Manager に保存し、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `APP_BASE_URL` を Cloud Run に設定する。

Cloud Run には同じサービスに複数の URL（`…-<番号>.asia-northeast1.run.app` と `…-<ハッシュ>-an.a.run.app`）がある。
連携はどちらの URL から始めても、`APP_BASE_URL` の URL に自動で移ってから Google に進む。

## 2-B. Vercel の場合

Settings → Environment Variables（Production / Preview）に `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`（Sensitive）、
`APP_BASE_URL=https://oshiready.vercel.app` を登録して再デプロイする。

## 3. 確認

- `<公開 URL>/api/session` の `googleOAuthConfigured` が `true`
- 設定画面 →「Google カレンダーを連携」→ Google の同意画面 → アプリに戻り「連携中」になる
- 「連携を解除」で Google アカウントの「サードパーティ接続」からも OshiReady が消える

## 注意

- 公開ステータスが「テスト」の間は、登録したテストユーザーだけが使え、連携は 7 日で切れる（再連携が必要）。
  — https://developers.google.com/identity/protocols/oauth2 / https://support.google.com/cloud/answer/15549945
- 誰でも使える本番公開には、カレンダー読み取りが機密性の高いスコープのため Google の審査が必要。
  — https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- `redirect_uri_mismatch` が出たら URI の打ち間違いを確認する。登録の反映に数分〜数時間かかることがある。
  — https://support.google.com/cloud/answer/15549257
